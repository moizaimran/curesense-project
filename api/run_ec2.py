"""
EC2 entrypoint — initialises all models from env vars, then starts Flask via gunicorn.
Run with:  gunicorn -w 1 -b 0.0.0.0:5001 --timeout 300 api.run_ec2:app
"""
import os
import glinker.config as cfg

from openai import OpenAI
import torch
from gliner import GLiNER

from glinker.disease.disease_retrieval import load_disease_index
from glinker.rag.retrieval import load_index as load_rag_index

# ── Load models ───────────────────────────────────────────────────────────────
print("[startup] Loading models...")

cfg.openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[startup] Device: {device}")

cfg.gliner_model  = GLiNER.from_pretrained("urchade/gliner_mediumv2.1").to(device)

load_rag_index()
load_disease_index()

print("[startup] All models loaded. Starting Flask...")

from api.app import app
