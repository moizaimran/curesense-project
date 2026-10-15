# ==============================================================================
# glinker/rag/retrieval.py
#
# Runtime retrieval — two responsibilities:
#
#   retrieve_context(rag_query)
#       Hybrid search: FAISS (dense) + BM25 (sparse), merged with Reciprocal
#       Rank Fusion (RRF). FAISS finds semantically similar chunks; BM25 catches
#       exact medical keywords (drug names, anatomy codes, lab values) that
#       semantic embeddings can miss. Result is filtered by similarity threshold.
#
#   get_medication_info(drug_names)
#       Calls openFDA directly for each drug the patient is taking.
#       Returns raw label data — NOT from the vector database.
#       This is called once, at report-generation time.
#
# Call load_index() once at notebook startup to initialise the state below.
# ==============================================================================
import json
import numpy as np
import faiss

from glinker import config
from glinker.rag.corpus import fetch_openfda

SIMILARITY_THRESHOLD_CLINICIAN = 0.45

# ── Module-level state (populated by load_index()) ────────────────────────────
_clinician_index    = None
_clinician_chunks   = None
_clinician_metadata = None
_clinician_bm25     = None     # BM25Okapi index, built from _clinician_chunks at load
CLINICIAN_RAG_READY = False

RAG_READY = False   # backward-compat alias


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

    # Build BM25 from the same chunk texts — no extra data needed
    try:
        from rank_bm25 import BM25Okapi
        tokenized = [c.lower().split() for c in _clinician_chunks]
        _clinician_bm25 = BM25Okapi(tokenized)
        print(f"✅ BM25 index built — {len(_clinician_chunks):,} documents")
    except ImportError:
        print("⬜ rank_bm25 not installed — falling back to FAISS-only retrieval.")
        print("   pip install rank_bm25")
    except Exception as e:
        print(f"⬜ BM25 index build failed: {e} — falling back to FAISS-only.")


# ── Core search helpers ───────────────────────────────────────────────────────

def _faiss_search(index, query: str, k: int) -> list[tuple[int, float]]:
    """Return (chunk_idx, cosine_score) pairs, sorted descending, no threshold applied."""
    model = config.get_embed_model()
    q_vec = model.encode([query], normalize_embeddings=True)
    q_vec = np.array(q_vec, dtype="float32")
    scores, indices = index.search(q_vec, k)
    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx != -1:
            results.append((int(idx), float(score)))
    return results   # already sorted descending by FAISS


def _bm25_search(bm25, query: str, k: int) -> list[tuple[int, float]]:
    """Return (chunk_idx, bm25_score) pairs for the top-k BM25 results."""
    tokens = query.lower().split()
    scores = bm25.get_scores(tokens)        # array of length N
    top_k  = int(np.argsort(scores)[-k:][::-1][0]) if k == 1 else \
              [int(i) for i in np.argsort(scores)[-k:][::-1]]
    if isinstance(top_k, int):
        top_k = [top_k]
    return [(idx, float(scores[idx])) for idx in top_k]


def _rrf_merge(
    dense : list[tuple[int, float]],
    sparse: list[tuple[int, float]],
    rrf_k : int = 60,
) -> list[tuple[int, float]]:
    """
    Reciprocal Rank Fusion of two ranked lists.
    Each list is (chunk_idx, score); only ranks matter, not score magnitudes.
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


def retrieve_context(rag_query: str, k: int = 8) -> list[dict]:
    """
    Hybrid retrieval for the doctor report. Combines FAISS dense search with
    BM25 sparse search via Reciprocal Rank Fusion, then filters by threshold.

    k=8 gives the LLM more grounding material (was 4 — often left doctor report
    empty when the top chunk was below threshold but chunks 5-8 were good).
    BM25 fallback: if rank_bm25 is not installed, uses FAISS only.
    Returns [] when CLINICIAN_RAG_READY is False or nothing survives threshold.
    """
    if not CLINICIAN_RAG_READY:
        return []
    try:
        fetch_k = k * 5   # over-fetch before threshold filter

        # Dense search
        dense = _faiss_search(_clinician_index, rag_query, fetch_k)

        if _clinician_bm25 is not None:
            # Sparse search + RRF merge
            sparse  = _bm25_search(_clinician_bm25, rag_query, fetch_k)
            ranked  = _rrf_merge(dense, sparse)
            # Use the dense cosine score for threshold filtering — BM25 scores
            # are not cosine similarities so we look up the FAISS score by idx.
            dense_score_map = dict(dense)
            results = []
            for idx, _rrf_score in ranked:
                dense_score = dense_score_map.get(idx, 0.0)
                if dense_score < SIMILARITY_THRESHOLD_CLINICIAN:
                    continue
                results.append(_make_result(
                    _clinician_chunks, _clinician_metadata, idx, dense_score
                ))
                if len(results) == k:
                    break
        else:
            # FAISS-only fallback
            results = []
            for idx, score in dense:
                if score < SIMILARITY_THRESHOLD_CLINICIAN:
                    continue
                results.append(_make_result(
                    _clinician_chunks, _clinician_metadata, idx, score
                ))
                if len(results) == k:
                    break

        return results

    except Exception as e:
        print(f"[retrieve_context] ERROR: {e}")
        return []


# Sections included when sending medication data to the LLM prompt.
# The full 7-section record is always fetched and returned — this is the
# trimmed view used only for prompt construction.
_LLM_MED_SECTIONS = frozenset({
    "contraindications",
    "warnings_and_precautions",
    "drug_interactions",
    "adverse_reactions",
})


_DOSE_WORDS = {
    "mg", "mcg", "g", "ml", "iu", "unit", "units", "tab", "tabs", "tablet", "tablets", "cap",
    "caps", "capsule", "capsules", "syrup", "injection", "once", "twice", "thrice", "daily",
    "weekly", "as", "needed", "prn", "od", "bd", "bid", "tds", "tid", "qid", "every", "at",
    "night", "morning", "evening", "per", "day", "x",
}


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
    per drug (_LLM_MED_SECTIONS). Used by LLM prompt formatters — the full
    7-section record returned by get_medication_info is not modified.
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
