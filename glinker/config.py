# ==============================================================================
# glinker/config.py
#
# Central configuration. Shared model/client instances are set to None here
# and assigned by the notebook after secrets are loaded:
#
#   import glinker.config as cfg
#   cfg.openai_client = OpenAI(api_key=...)
#   cfg.gliner_model  = GLiNER.from_pretrained(...).to("cuda")
#   cfg.whisper_model = whisper.load_model("large", device="cuda")
# ==============================================================================

# ── Shared runtime instances (set by main.ipynb after loading secrets) ────────
openai_client   = None
gliner_model    = None
whisper_model   = None
embedding_model = None   # SentenceTransformer, loaded on first use by get_embed_model()

# ── Embedding (local, free, GPU-accelerated) ──────────────────────────────────
# bge-large: 1024-dim, 335M params — 3-5% better MTEB retrieval vs bge-base.
# Changing this requires a full rebuild of both RAG and disease indexes on Kaggle.
EMBEDDING_MODEL = "BAAI/bge-large-en-v1.5"

# ── Reranker (Stage 2 of retrieval pipeline) ──────────────────────────────────
# MedCPT: trained on PubMed search logs — domain-matched for biomedical text.
# Loaded lazily on first retrieve_context() call; ~440MB on GPU.
RERANKER_MODEL = "ncbi/MedCPT-Cross-Encoder"

def get_embed_model():
    """Load (or return cached) SentenceTransformer embedding model."""
    global embedding_model
    if embedding_model is None:
        from sentence_transformers import SentenceTransformer
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        embedding_model = SentenceTransformer(EMBEDDING_MODEL, device=device)
        print(f"Embedding model ({EMBEDDING_MODEL}) loaded on {device}")
    return embedding_model

# ── File-system paths (Kaggle working directory) ──────────────────────────────
RAG_INDEX_DIR = '/kaggle/working/rag_index'

# ── LLM settings ─────────────────────────────────────────────────────────────
LLM_CONFIG = {
    "model"                    : "gpt-5.6-luna",
    "reasoning_effort"         : "low",
    "interview_turn_max_tokens": 1000,   # reasoning tokens count toward this cap; 500 truncated replies
    "finalize_max_tokens"      : 1200,
    "diagnose_max_tokens"      : 2000,
    "checkpoint_max_tokens"    : 600,
    "interview_max_turns"      : 15,
}

# ── GLiNER label set ──────────────────────────────────────────────────────────
MEDICAL_LABELS = [
    "symptom",
    "medical condition",
    "body part",
    "severity",
    "duration",
    "medication",
    "dosage",
    "frequency",
    "allergy",
    "trigger",
]
