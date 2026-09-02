# ==============================================================================
# glinker/disease/disease_retrieval.py
#
# Query-time disease retrieval — replaces the TF-IDF ranker.
#
# Call load_disease_index() once at notebook startup (after build_disease_index
# has been run at least once to create the FAISS files).
#
# Then call retrieve_diseases(entities, diagnostic_query) at pipeline time.
# It returns top-k disease paragraphs that the combined_report LLM uses to
# evaluate plausibility — same interface as the old rank_diseases() output
# but semantically matched instead of TF-IDF vocabulary matched.
# ==============================================================================
import json
import numpy as np
import faiss

from glinker import config

DISEASE_INDEX_DIR   = "/kaggle/working/disease_index"
SIMILARITY_THRESHOLD = 0.35   # lower than RAG threshold — disease names are shorter
TOP_K               = 5       # number of disease candidates to return to the LLM

# ── Module-level state ────────────────────────────────────────────────────────
_disease_index = None
_paragraphs    = None
_metadata      = None
DISEASE_READY  = False


def load_disease_index() -> None:
    """
    Load the FAISS disease index built by build_disease_index().
    Call once at notebook startup, after load_index() for the textbook RAG.
    """
    global _disease_index, _paragraphs, _metadata, DISEASE_READY

    try:
        _disease_index = faiss.read_index(f"{DISEASE_INDEX_DIR}/disease_index.faiss")
        with open(f"{DISEASE_INDEX_DIR}/disease_meta.json") as f:
            data = json.load(f)
        _paragraphs   = data["paragraphs"]
        _metadata     = data["metadata"]
        DISEASE_READY = True
        print(f"✅ Disease index loaded — {_disease_index.ntotal:,} diseases")
    except Exception as e:
        print(f"⬜ Disease index not loaded: {e}")
        print("   Run build_disease_index() first, then re-call load_disease_index().")


def retrieve_diseases(
    verified_entities : list[dict],
    diagnostic_query  : str,
    k                 : int = TOP_K,
) -> list[dict]:
    """
    Build a semantic query from the patient's verified entities + diagnostic_query,
    embed it, search the disease FAISS index, and return the top-k matching
    disease paragraphs for the LLM to evaluate.

    Returns [] when DISEASE_READY is False (graceful degradation — pipeline
    continues and the LLM falls back to its own clinical knowledge).

    Return format (same as old rank_diseases for drop-in compatibility):
        [{"disease": str, "confidence": float, "paragraph": str}, ...]
    """
    if not DISEASE_READY:
        return []

    # ── Build query string ────────────────────────────────────────────────────
    # Use symptom/trigger/body-part entities as the core query signal.
    # Exclude medications — they bias toward medication-specific conditions.
    symptom_cats = {"symptom", "trigger", "body part", "severity", "duration"}
    symptom_kws  = [
        e["keyword"] for e in verified_entities
        if e.get("category") in symptom_cats
    ]

    if not symptom_kws and not diagnostic_query:
        return []

    # Combine symptom keywords + the LLM-crafted diagnostic query for richer signal
    query = " ".join(symptom_kws)
    if diagnostic_query:
        query = query + " " + diagnostic_query
    query = query.strip()

    # ── Embed + search ────────────────────────────────────────────────────────
    try:
        model = config.get_embed_model()
        q_vec = model.encode([query], normalize_embeddings=True)
        q_vec = np.array(q_vec, dtype="float32")

        # Over-fetch then filter — ensures we get k results above threshold
        scores, indices = _disease_index.search(q_vec, k * 4)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1 or float(score) < SIMILARITY_THRESHOLD:
                continue

            meta      = _metadata[idx]
            paragraph = _paragraphs[idx]

            results.append({
                "disease"   : meta["disease"],
                "icd_code"  : meta.get("icd_code", ""),
                "confidence": round(float(score) * 100, 1),
                "paragraph" : paragraph,
            })

            if len(results) == k:
                break

        if results:
            print(f"[DiseaseRAG] {len(results)} candidate(s) retrieved for: {query[:80]!r}")
        else:
            print("[DiseaseRAG] No candidates above threshold — LLM will use clinical knowledge only.")

        return results

    except Exception as e:
        print(f"[DiseaseRAG] ERROR: {e}")
        return []
