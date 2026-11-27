# ==============================================================================
# glinker/rag/retrieval.py
#
# Runtime retrieval — two responsibilities:
#
#   retrieve_context(rag_queries)
#       Three-stage pipeline:
#         Stage 1 — Multi-query hybrid search:
#                   For each of up to 3 LLM-generated query variants, run
#                   FAISS (dense) + BM25 (sparse) merged via RRF. Results are
#                   deduplicated across queries (highest FAISS score wins).
#         Stage 2 — MedCPT reranker:
#                   Cross-encoder trained on PubMed search logs rescores the
#                   top-N candidates using (query, chunk) full-attention pairs.
#         Stage 3 — Dynamic threshold:
#                   Filter at max(SIMILARITY_FLOOR, top_score × 0.60) so the
#                   bar rises when good evidence exists and falls when it doesn't.
#
#   get_medication_info(drug_names)
#       Calls openFDA directly for each drug the patient is taking.
#       Returns raw label data — NOT from the vector database.
#       This is called once, at report-generation time.
#
# BM25 uses PorterStemmer (nltk) when available, falling back to a medical
# suffix strip list, so "hypertensive" and "hypertension" tokenise to the
# same stem regardless of path.
#
# Call load_index() once at notebook startup to initialise the state below.
# ==============================================================================
import json
import os
import pickle
import threading
import numpy as np
import faiss

from glinker import config
from glinker.rag.corpus import fetch_openfda

# Hard floor: chunks scoring below this are dropped before the reranker.
# Lower than the old static 0.45 so more candidates reach the reranker.
SIMILARITY_FLOOR = 0.35

# ── Module-level state (populated by load_index()) ────────────────────────────
_clinician_index    = None
_clinician_chunks   = None
_clinician_metadata = None
_clinician_bm25     = None
CLINICIAN_RAG_READY = False

RAG_READY = False   # backward-compat alias

# ── BM25 tokeniser with medical stemming ──────────────────────────────────────

_stemmer = None   # cached PorterStemmer instance

_MED_SUFFIXES = (
    # Longer suffixes first to avoid partial matches
    "ization", "isation", "ological", "ologist", "ology",
    "ectomy", "otomy", "plasty", "scopy",
    "ation", "ition", "osis", "emia", "uria", "itis",
    "ive", "ous", "tic", "ical", "ary", "ory", "ic", "al",
)


def _get_stemmer():
    global _stemmer
    if _stemmer is None:
        try:
            from nltk.stem import PorterStemmer
            _stemmer = PorterStemmer()
        except ImportError:
            _stemmer = False   # sentinel: tried and not available
    return _stemmer if _stemmer is not False else None


def _tokenize_for_bm25(text: str) -> list[str]:
    """
    Tokenise and stem text for BM25 indexing and querying.

    Uses nltk PorterStemmer when available so "hypertensive", "hypertension"
    and "hypertensive" all map to the same stem. Falls back to a medical suffix
    strip list (conservative, targets known medical morphology only).

    Must be used consistently for BOTH index build and query time.
    """
    stemmer = _get_stemmer()
    tokens  = [t for t in text.lower().split() if len(t) > 1]
    if stemmer:
        return [stemmer.stem(t) for t in tokens]
    # Medical suffix fallback
    result = []
    for t in tokens:
        for suf in _MED_SUFFIXES:
            if len(t) > len(suf) + 3 and t.endswith(suf):
                t = t[:-len(suf)]
                break
        result.append(t)
    return result


def _start_bm25_background(cache_path: str) -> None:
    """
    Load BM25 from cache or build it in a daemon thread.
    Either way the Flask worker becomes available immediately after FAISS loads.
    """
    global _clinician_bm25

    def _build():
        global _clinician_bm25
        try:
            from rank_bm25 import BM25Okapi
            if os.path.exists(cache_path):
                with open(cache_path, "rb") as f:
                    _clinician_bm25 = pickle.load(f)
                print(f"✅ BM25 index loaded from cache — {len(_clinician_chunks):,} documents")
                return
            print(f"⚙️  Building BM25 index for {len(_clinician_chunks):,} documents (background, one-time)…")
            tokenized = [_tokenize_for_bm25(c) for c in _clinician_chunks]
            _clinician_bm25 = BM25Okapi(tokenized)
            with open(cache_path, "wb") as f:
                pickle.dump(_clinician_bm25, f, protocol=pickle.HIGHEST_PROTOCOL)
            print(f"✅ BM25 index built and cached — {len(_clinician_chunks):,} documents")
        except ImportError:
            print("⬜ rank_bm25 not installed — FAISS-only retrieval")
        except Exception as e:
            print(f"⬜ BM25 build failed: {e} — FAISS-only retrieval")

    t = threading.Thread(target=_build, daemon=True, name="bm25-builder")
    t.start()


def load_index() -> None:
    """Load clinician FAISS index and build a BM25 index from the same chunks."""
    global _clinician_index, _clinician_chunks, _clinician_metadata
    global _clinician_bm25, CLINICIAN_RAG_READY, RAG_READY

    index_dir = config.RAG_INDEX_DIR
    try:
        _clinician_index = faiss.read_index(f"{index_dir}/clinician_index.faiss")
        with open(f"{index_dir}/clinician_meta.json") as f:
            data = json.load(f)
        _clinician_chunks   = data["chunks"]
        _clinician_metadata = data["metadata"]
        CLINICIAN_RAG_READY = True
        RAG_READY           = True
        print(f"✅ Clinician RAG index loaded — {_clinician_index.ntotal:,} vectors")
    except Exception as e:
        print(f"⬜ Clinician RAG index not loaded: {e}")
        print("   Run ingestion.build_index() first, then re-call load_index().")
        return

    # Build BM25 in a background thread so the Flask app starts accepting
    # requests immediately after FAISS loads. BM25 enhances retrieval but
    # FAISS-only search is still usable while it builds.
    # The finished index (or a cache pkl) is used on the next RAG call.
    bm25_cache_path = os.path.join(index_dir, "clinician_bm25.pkl")
    _start_bm25_background(bm25_cache_path)


# ── MedCPT reranker (Stage 2) ─────────────────────────────────────────────────

_reranker_cache = None   # (tokenizer, model, device) or None


def _load_reranker():
    """Lazy-load ncbi/MedCPT-Cross-Encoder. Returns None if unavailable."""
    global _reranker_cache
    if _reranker_cache is not None:
        return _reranker_cache
    try:
        import torch
        from transformers import AutoTokenizer, AutoModelForSequenceClassification
        model_name = config.RERANKER_MODEL
        tokenizer  = AutoTokenizer.from_pretrained(model_name)
        model      = AutoModelForSequenceClassification.from_pretrained(model_name)
        device     = "cuda" if torch.cuda.is_available() else "cpu"
        model      = model.to(device).eval()
        _reranker_cache = (tokenizer, model, device)
        print(f"✅ MedCPT reranker loaded on {device}")
    except Exception as e:
        print(f"⬜ MedCPT reranker not available: {e} — Stage 2 skipped.")
        _reranker_cache = False   # tried, not available
    return _reranker_cache if _reranker_cache is not False else None


def _rerank(query: str, candidates: list[dict]) -> list[dict]:
    """
    Score every (query, chunk) pair with MedCPT cross-encoder and resort.
    Adds 'rerank_score' to each candidate dict.
    Returns original order if reranker is unavailable.
    """
    reranker = _load_reranker()
    if not reranker or not candidates:
        return candidates

    tokenizer, model, device = reranker
    import torch

    pairs  = [[query, c["text"]] for c in candidates]
    scores = []

    try:
        with torch.no_grad():
            for i in range(0, len(pairs), 32):
                batch   = pairs[i : i + 32]
                encoded = tokenizer(
                    [p[0] for p in batch],
                    [p[1] for p in batch],
                    padding=True, truncation=True,
                    max_length=512, return_tensors="pt",
                ).to(device)
                logits = model(**encoded).logits.squeeze(-1)
                scores.extend(logits.cpu().float().tolist())
    except Exception as e:
        print(f"[reranker] scoring failed: {e} — returning unranked candidates.")
        return candidates

    for c, s in zip(candidates, scores):
        c["rerank_score"] = float(s)
    return sorted(candidates, key=lambda x: x.get("rerank_score", 0.0), reverse=True)


# ── Core search helpers ───────────────────────────────────────────────────────

def _faiss_search(index, query: str, k: int) -> list[tuple[int, float]]:
    """Return (chunk_idx, cosine_score) pairs sorted descending. No threshold applied."""
    model = config.get_embed_model()
    q_vec = model.encode([query], normalize_embeddings=True)
    q_vec = np.array(q_vec, dtype="float32")
    scores, indices = index.search(q_vec, k)
    return [
        (int(idx), float(score))
        for score, idx in zip(scores[0], indices[0])
        if idx != -1
    ]


def _bm25_search(bm25, query: str, k: int) -> list[tuple[int, float]]:
    """Return (chunk_idx, bm25_score) pairs for the top-k BM25 results."""
    tokens      = _tokenize_for_bm25(query)
    scores      = bm25.get_scores(tokens)
    top_indices = [int(i) for i in np.argsort(scores)[-k:][::-1]]
    return [(idx, float(scores[idx])) for idx in top_indices]


def _rrf_merge(
    dense : list[tuple[int, float]],
    sparse: list[tuple[int, float]],
    rrf_k : int = 60,
) -> list[tuple[int, float]]:
    """
    Reciprocal Rank Fusion of two ranked lists.
    Only ranks matter — not score magnitudes.
    Returns merged list sorted by combined RRF score, descending.
    """
    combined: dict[int, float] = {}
    for rank, (idx, _) in enumerate(dense):
        combined[idx] = combined.get(idx, 0.0) + 1.0 / (rrf_k + rank + 1)
    for rank, (idx, _) in enumerate(sparse):
        combined[idx] = combined.get(idx, 0.0) + 1.0 / (rrf_k + rank + 1)
    return sorted(combined.items(), key=lambda x: -x[1])


def _make_result(chunks, metadata, idx: int, score: float) -> dict:
    return {
        "text"    : chunks[idx],
        "source"  : metadata[idx].get("source", "unknown"),
        "doc_type": metadata[idx].get("doc_type", ""),
        "title"   : metadata[idx].get("title", ""),
        "audience": metadata[idx].get("audience", ""),
        "score"   : round(score, 4),
    }


# ── Main retrieval entry point ────────────────────────────────────────────────

def retrieve_context(rag_queries: "list[str] | str", k: int = 8) -> list[dict]:
    """
    Three-stage hybrid retrieval.

    Stage 1 — Multi-query hybrid search:
      Accepts a single query string or a list of up to 3 LLM-generated variants.
      Each variant is searched independently (FAISS dense + BM25 sparse + RRF).
      Candidates from all queries are merged; duplicates resolved by highest
      FAISS cosine score. This catches chunks that match one phrasing but not
      another without any manual synonym lists.

    Stage 2 — MedCPT reranker:
      Uses the primary query (index 0) to score every (query, chunk) pair with
      a cross-encoder trained on PubMed search logs. Resorts candidates by
      cross-encoder logit. Gracefully skipped if model is unavailable.

    Stage 3 — Dynamic threshold:
      Filters at max(SIMILARITY_FLOOR, top_faiss_score × 0.60). The threshold
      rises when strong evidence exists and relaxes when only weak matches are
      available, while never going below SIMILARITY_FLOOR = 0.35.

    Returns [] when CLINICIAN_RAG_READY is False or nothing survives threshold.
    """
    if not CLINICIAN_RAG_READY:
        return []

    if isinstance(rag_queries, str):
        rag_queries = [rag_queries]
    rag_queries = [q.strip() for q in rag_queries if q.strip()]
    if not rag_queries:
        return []

    try:
        fetch_k = k * 5   # over-fetch before threshold + reranker

        # ── Stage 1: multi-query hybrid search ───────────────────────────────
        all_candidates: dict[str, dict] = {}   # deduplicate by chunk text

        for query in rag_queries:
            dense = _faiss_search(_clinician_index, query, fetch_k)

            if _clinician_bm25 is not None:
                sparse          = _bm25_search(_clinician_bm25, query, fetch_k)
                ranked          = _rrf_merge(dense, sparse)
                dense_score_map = dict(dense)
                for idx, _rrf_score in ranked:
                    dense_score = dense_score_map.get(idx, 0.0)
                    if dense_score < SIMILARITY_FLOOR:
                        continue
                    result   = _make_result(_clinician_chunks, _clinician_metadata, idx, dense_score)
                    text_key = _clinician_chunks[idx]
                    # Keep highest-scoring version if same chunk retrieved via multiple queries
                    if text_key not in all_candidates or dense_score > all_candidates[text_key]["score"]:
                        all_candidates[text_key] = result
            else:
                for idx, score in dense:
                    if score < SIMILARITY_FLOOR:
                        continue
                    result   = _make_result(_clinician_chunks, _clinician_metadata, idx, score)
                    text_key = _clinician_chunks[idx]
                    if text_key not in all_candidates or score > all_candidates[text_key]["score"]:
                        all_candidates[text_key] = result

        candidates = list(all_candidates.values())
        if not candidates:
            return []

        # ── Stage 2: MedCPT reranker ──────────────────────────────────────────
        # Use the primary query (index 0) for cross-encoder scoring.
        candidates = _rerank(rag_queries[0], candidates)

        # ── Stage 3: dynamic threshold ────────────────────────────────────────
        # Applied to the original FAISS cosine score (not reranker logit) to
        # keep the threshold scale consistent and interpretable.
        top_score = max(c["score"] for c in candidates)
        threshold = max(SIMILARITY_FLOOR, top_score * 0.60)
        filtered  = [c for c in candidates if c["score"] >= threshold]

        return filtered[:k]

    except Exception as e:
        print(f"[retrieve_context] ERROR: {e}")
        return []


# ── Medication info (openFDA) ─────────────────────────────────────────────────

_DOSE_WORDS = {
    "mg", "mcg", "g", "ml", "iu", "unit", "units", "tab", "tabs", "tablet", "tablets", "cap",
    "caps", "capsule", "capsules", "syrup", "injection", "once", "twice", "thrice", "daily",
    "weekly", "as", "needed", "prn", "od", "bd", "bid", "tds", "tid", "qid", "every", "at",
    "night", "morning", "evening", "per", "day", "x",
}

# Sections included when sending medication data to the LLM prompt.
_LLM_MED_SECTIONS = frozenset({
    "contraindications",
    "warnings_and_precautions",
    "drug_interactions",
    "adverse_reactions",
})


def _strip_dose(name: str) -> str:
    """'Losartan 50mg once daily' → 'losartan'. Fallback when no generic name is known."""
    kept = []
    for token in name.lower().replace("(", " ").replace(")", " ").split():
        if token[0].isdigit() or token in _DOSE_WORDS:
            break
        kept.append(token)
    return " ".join(kept)


def get_medication_info(
    drug_names   : list[str],
    generic_names: dict[str, str] | None = None,
) -> dict[str, dict]:
    """
    Look up the official US drug label (openFDA) for each medication the patient takes.

    drug_names    — names as the patient gave them: interview entities first, then the
                    saved profile list (this pipeline never touches the database).
    generic_names — {lowercased name → US generic name} from finalize_report; brand and
                    local names (Panadol, Augmentin, paracetamol) only match openFDA by generic.

    Returns {name as given: {drug, generic_name, label_found, source, sections}} for EVERY
    medication — label_found False (and no sections) when no label exists, so later steps
    still flag it from clinical knowledge and the report records the attempt. Two entries
    resolving to the same generic (e.g. "Losartan" and "Losartan 50mg daily") are merged,
    keeping the first name given.
    """
    generic_names = {k.strip().lower(): v for k, v in (generic_names or {}).items()}
    results: dict[str, dict] = {}
    seen: set[str] = set()
    for raw in drug_names:
        name = raw.strip()
        if not name:
            continue
        generic = (generic_names.get(name.lower()) or "").strip().lower()
        if not generic or generic == "unknown":
            generic = _strip_dose(name) if generic != "unknown" else ""
        key = generic or name.lower()
        if key in seen:
            continue
        seen.add(key)

        info = fetch_openfda(generic) if generic else None
        results[name] = {
            "drug"        : name,
            "generic_name": generic or "unknown",
            "label_found" : bool(info),
            "source"      : info["source"] if info else "",
            "sections"    : info["sections"] if info else {},
        }
    return results


def trim_medication_info(medication_info: dict) -> dict:
    """
    Return a copy of medication_info keeping only the 4 safety-relevant sections
    per drug. Used by LLM prompt formatters — the full record is not modified.
    """
    trimmed = {}
    for drug, info in medication_info.items():
        trimmed[drug] = {
            **{k: v for k, v in info.items() if k != "sections"},
            "sections": {
                k: v for k, v in info.get("sections", {}).items()
                if k in _LLM_MED_SECTIONS
            },
        }
    return trimmed
