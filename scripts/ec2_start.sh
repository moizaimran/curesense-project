#!/bin/bash
# ── CureSense AI — EC2 startup script ────────────────────────────────────────
# Syncs FAISS indexes from S3, then starts the Flask server.
# Run once manually after deploy, then managed by systemd (curesense-ai.service).
#
# Required env vars (set in /etc/curesense/env or export before running):
#   S3_INDEX_BUCKET   e.g. curesense-ai-indexes
#   AWS_DEFAULT_REGION e.g. ap-southeast-2
# Optional:
#   RAG_INDEX_DIR      default: /opt/curesense/rag_index
#   DISEASE_INDEX_DIR  default: /opt/curesense/disease_index

set -euo pipefail

RAG_INDEX_DIR="${RAG_INDEX_DIR:-/opt/curesense/rag_index}"
DISEASE_INDEX_DIR="${DISEASE_INDEX_DIR:-/opt/curesense/disease_index}"
S3_INDEX_BUCKET="${S3_INDEX_BUCKET:-curesense-ai-indexes}"
REPO_DIR="${REPO_DIR:-/opt/curesense/app}"

echo "[curesense] Starting up — $(date)"

# ── Pull latest code ──────────────────────────────────────────────────────────
echo "[curesense] Pulling latest code..."
git -C "$REPO_DIR" pull origin hassan-branch || echo "[curesense] WARNING: git pull failed, continuing with current code"

# ── Sync FAISS indexes from S3 ───────────────────────────────────────────────
# S3 layout:
#   s3://<bucket>/rag_index/clinician_index.faiss
#   s3://<bucket>/rag_index/clinician_meta.json
#   s3://<bucket>/rag_index/bm25_index.pkl  (if exists)
#   s3://<bucket>/disease_index/disease_index.faiss
#   s3://<bucket>/disease_index/disease_meta.json

echo "[curesense] Syncing RAG index from s3://$S3_INDEX_BUCKET/rag_index/ ..."
mkdir -p "$RAG_INDEX_DIR"
aws s3 sync "s3://$S3_INDEX_BUCKET/rag_index/" "$RAG_INDEX_DIR/" --region "$AWS_DEFAULT_REGION" \
  && echo "[curesense] RAG index ready at $RAG_INDEX_DIR" \
  || echo "[curesense] WARNING: S3 sync failed — index will be built from scratch"

echo "[curesense] Syncing disease index from s3://$S3_INDEX_BUCKET/disease_index/ ..."
mkdir -p "$DISEASE_INDEX_DIR"
aws s3 sync "s3://$S3_INDEX_BUCKET/disease_index/" "$DISEASE_INDEX_DIR/" --region "$AWS_DEFAULT_REGION" \
  && echo "[curesense] Disease index ready at $DISEASE_INDEX_DIR" \
  || echo "[curesense] WARNING: Disease index S3 sync failed — will build from scratch"

# ── Start Flask ───────────────────────────────────────────────────────────────
echo "[curesense] Starting Flask on port 5001..."
cd "$REPO_DIR"
export RAG_INDEX_DIR DISEASE_INDEX_DIR S3_INDEX_BUCKET

exec python -m gunicorn \
  --bind 0.0.0.0:5001 \
  --workers 1 \
  --threads 4 \
  --timeout 300 \
  --access-logfile - \
  --error-logfile - \
  api.app:app
