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
openai_client = None
gliner_model  = None
whisper_model = None

# ── File-system paths (Kaggle working directory) ──────────────────────────────
RAG_INDEX_DIR = '/kaggle/working/rag_index'

# ── LLM settings ─────────────────────────────────────────────────────────────
LLM_CONFIG = {
    "model"                    : "gpt-5.6-luna",
    "reasoning_effort"         : "low",
    "interview_turn_max_tokens": 500,
    "finalize_max_tokens"      : 1200,
    "diagnose_max_tokens"      : 1500,
    "patient_summary_max_tokens": 800,
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
