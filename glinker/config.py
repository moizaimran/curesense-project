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
EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"   # 384-dim, trained for retrieval

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
    "interview_turn_max_tokens": 500,
    "finalize_max_tokens"      : 1200,
    "diagnose_max_tokens"      : 2000,
    "interview_max_turns"      : 12,
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
