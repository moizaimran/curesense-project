# ==============================================================================
# glinker/config.py
#
# Central configuration. Shared model/client instances are set to None here
# and assigned by the notebook after secrets are loaded:
#
#   import glinker.config as cfg
#   cfg.bedrock_client = boto3.client("bedrock-runtime", region_name="us-east-1")
#   cfg.gliner_model   = GLiNER.from_pretrained(...).to("cuda")
#   cfg.whisper_model  = whisper.load_model("large", device="cuda")
# ==============================================================================

# ── Shared runtime instances (set by main.ipynb after loading secrets) ────────
bedrock_client  = None   # boto3 bedrock-runtime client
gliner_model    = None
whisper_model   = None
embedding_model = None   # SentenceTransformer, loaded on first use by get_embed_model()

# ── Embedding (local, free, GPU-accelerated) ──────────────────────────────────
EMBEDDING_MODEL = "BAAI/bge-base-en-v1.5"    # 768-dim, stronger medical retrieval; rebuild both indexes after changing

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

# ── File-system paths ────────────────────────────────────────────────────────
# EC2: set RAG_INDEX_DIR=/opt/curesense/rag_index (via env or startup script)
# Kaggle: defaults to /kaggle/working/rag_index
import os
RAG_INDEX_DIR    = os.environ.get('RAG_INDEX_DIR',    '/kaggle/working/rag_index')
DISEASE_INDEX_DIR = os.environ.get('DISEASE_INDEX_DIR', '/kaggle/working/disease_index')

# S3 bucket holding pre-built indexes (set S3_INDEX_BUCKET env var on EC2)
S3_INDEX_BUCKET  = os.environ.get('S3_INDEX_BUCKET', '')

# ── LLM settings ─────────────────────────────────────────────────────────────
LLM_CONFIG = {
    "model"                    : "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "interview_turn_max_tokens": 1000,
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
