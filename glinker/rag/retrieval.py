# ==============================================================================
# glinker/rag/retrieval.py
#
# Runtime retrieval — two responsibilities:
#
#   retrieve_context(rag_query)
#       Embeds the query and searches the FAISS index (textbooks + guidelines).
#       Returns ranked chunks above the similarity threshold.
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

SIMILARITY_THRESHOLD = 0.45   # minimum cosine score — raised to filter out weak drug-ADR matches

# ── Module-level state (populated by load_index()) ────────────────────────────
_rag_index    = None
_rag_chunks   = None
_rag_metadata = None
RAG_READY     = False


def load_index() -> None:
    """Load the FAISS index built by ingestion.build_index(). Call once at startup."""
    global _rag_index, _rag_chunks, _rag_metadata, RAG_READY
    index_dir = config.RAG_INDEX_DIR
    try:
        _rag_index = faiss.read_index(f"{index_dir}/index.faiss")
        with open(f"{index_dir}/chunks.json") as f:
            data = json.load(f)
        _rag_chunks   = data["chunks"]
        _rag_metadata = data["metadata"]
        RAG_READY     = True
        print(f"✅ RAG index loaded — {_rag_index.ntotal:,} vectors")
    except Exception as e:
        print(f"⬜ RAG index not loaded: {e}")
        print("   Run ingestion.build_index() first, then re-call load_index().")


def retrieve_context(rag_query: str, k: int = 4) -> list[dict]:
    """
    Embed rag_query, search the FAISS index, return top-k chunks above
    SIMILARITY_THRESHOLD. Returns [] when RAG_READY is False or nothing matches.

    Each result dict: {text, source, doc_type, title, score}
    """
    if not RAG_READY:
        return []
    try:
        model = config.get_embed_model()
        q_vec = model.encode([rag_query], normalize_embeddings=True)
        q_vec = np.array(q_vec, dtype="float32")

        scores, indices = _rag_index.search(q_vec, k * 5)   # over-fetch then filter by threshold

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1 or float(score) < SIMILARITY_THRESHOLD:
                continue
            results.append({
                "text"    : _rag_chunks[idx],
                "source"  : _rag_metadata[idx].get("source", "unknown"),
                "doc_type": _rag_metadata[idx].get("doc_type", ""),
                "title"   : _rag_metadata[idx].get("title", ""),
                "score"   : round(float(score), 4),
            })
            if len(results) == k:
                break
        return results
    except Exception as e:
        print(f"[retrieve_context] ERROR: {e}")
        return []


def get_medication_info(drug_names: list[str]) -> dict[str, dict]:
    """
    For each drug name, fetch the openFDA label directly (live API call).
    Returns {drug_name: {drug, source, sections}} for drugs found, omits others.

    Called once per pipeline run, after the interview is complete.
    """
    results = {}
    for name in drug_names:
        info = fetch_openfda(name.lower())
        if info:
            results[name] = info
    return results
