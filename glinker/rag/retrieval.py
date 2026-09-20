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

SIMILARITY_THRESHOLD_CLINICIAN = 0.45
SIMILARITY_THRESHOLD_PATIENT   = 0.40

# ── Module-level state (populated by load_index()) ────────────────────────────
_clinician_index    = None
_clinician_chunks   = None
_clinician_metadata = None
CLINICIAN_RAG_READY = False

_patient_index    = None
_patient_chunks   = None
_patient_metadata = None
PATIENT_RAG_READY = False

RAG_READY = False   # backward-compat alias — True when clinician index is loaded


def load_index() -> None:
    """Load both audience-split FAISS indexes. Call once at startup."""
    global _clinician_index, _clinician_chunks, _clinician_metadata, CLINICIAN_RAG_READY
    global _patient_index, _patient_chunks, _patient_metadata, PATIENT_RAG_READY
    global RAG_READY
    index_dir = config.RAG_INDEX_DIR

    # Clinician index (required — doctor report depends on it)
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

    # Patient index (optional — pipeline degrades gracefully if absent)
    try:
        _patient_index = faiss.read_index(f"{index_dir}/patient_index.faiss")
        with open(f"{index_dir}/patient_meta.json") as f:
            data = json.load(f)
        _patient_chunks   = data["chunks"]
        _patient_metadata = data["metadata"]
        PATIENT_RAG_READY = True
        print(f"✅ Patient RAG index loaded — {_patient_index.ntotal:,} vectors")
    except Exception as e:
        print(f"⬜ Patient RAG index not loaded: {e}")


def _search(index, chunks, metadata, query: str, k: int, threshold: float) -> list[dict]:
    """Shared FAISS search logic used by both retrieve functions."""
    model = config.get_embed_model()
    q_vec = model.encode([query], normalize_embeddings=True)
    q_vec = np.array(q_vec, dtype="float32")
    scores, indices = index.search(q_vec, k * 5)
    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx == -1 or float(score) < threshold:
            continue
        results.append({
            "text"    : chunks[idx],
            "source"  : metadata[idx].get("source", "unknown"),
            "doc_type": metadata[idx].get("doc_type", ""),
            "title"   : metadata[idx].get("title", ""),
            "audience": metadata[idx].get("audience", ""),
            "score"   : round(float(score), 4),
        })
        if len(results) == k:
            break
    return results


def retrieve_context(rag_query: str, k: int = 4) -> list[dict]:
    """
    Doctor-facing retrieval. Searches the clinician corpus (textbooks + clinician
    and mixed guidelines) using ragQuery. Threshold: 0.45.
    Returns [] when CLINICIAN_RAG_READY is False or nothing matches.
    """
    if not CLINICIAN_RAG_READY:
        return []
    try:
        return _search(_clinician_index, _clinician_chunks, _clinician_metadata,
                       rag_query, k, SIMILARITY_THRESHOLD_CLINICIAN)
    except Exception as e:
        print(f"[retrieve_context] ERROR: {e}")
        return []


def retrieve_patient_context(diagnostic_query: str, k: int = 4) -> list[dict]:
    """
    Patient-facing retrieval. Searches the patient corpus (wikidoc + mixed guidelines)
    using diagnosticQuery (jargon-free, from the finalize step). Threshold: 0.40.
    Returns [] when PATIENT_RAG_READY is False or nothing matches.
    """
    if not PATIENT_RAG_READY:
        return []
    try:
        return _search(_patient_index, _patient_chunks, _patient_metadata,
                       diagnostic_query, k, SIMILARITY_THRESHOLD_PATIENT)
    except Exception as e:
        print(f"[retrieve_patient_context] ERROR: {e}")
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


def get_medication_info(
    drug_names: list[str],
    profile_medications: list[str] = [],
) -> dict[str, dict]:
    """
    For each drug name, fetch the openFDA label directly (live API call).
    Returns {drug_name: {drug, source, sections}} for drugs found, omits others.

    drug_names          — medication keywords from this session's verified entities.
    profile_medications — medications from the patient's stored profile, passed in
                          by the caller (this pipeline never touches the database).
    Both lists are merged and deduplicated (by lowercase) before API calls are made.
    Original casing of the first occurrence is preserved as the dict key —
    session names (drug_names) take priority since they are listed first.
    """
    seen: dict[str, str] = {}   # lowercase → original_casing
    for name in drug_names + profile_medications:
        stripped = name.strip()
        if stripped:
            lower = stripped.lower()
            if lower not in seen:
                seen[lower] = stripped  # first occurrence wins (session before profile)
    results = {}
    for lower_key, original_name in seen.items():
        info = fetch_openfda(lower_key)   # API call always uses lowercase
        if info:
            results[original_name] = info  # dict key preserves original casing
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
