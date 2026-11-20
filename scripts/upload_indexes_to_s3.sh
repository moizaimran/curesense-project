#!/bin/bash
# ── Upload locally-built FAISS indexes to S3 ─────────────────────────────────
# Run this from the EC2 instance AFTER the indexes have been built
# (either via Kaggle export or by running the build cells on EC2 itself).
#
# Usage:
#   # On EC2, after index build completes:
#   bash scripts/upload_indexes_to_s3.sh
#
#   # Or from Kaggle: download the index files, then upload from your MacBook:
#   bash scripts/upload_indexes_to_s3.sh --local

set -euo pipefail

RAG_DIR="${RAG_INDEX_DIR:-/opt/curesense/rag_index}"
DISEASE_DIR="${DISEASE_INDEX_DIR:-/opt/curesense/disease_index}"
S3_BUCKET="${S3_INDEX_BUCKET:-curesense-ai-indexes}"
REGION="${AWS_DEFAULT_REGION:-ap-southeast-2}"

echo "Uploading RAG index to s3://$S3_BUCKET/rag_index/ ..."
aws s3 sync "$RAG_DIR/" "s3://$S3_BUCKET/rag_index/" \
  --region "$REGION" \
  --exclude "*.tmp"
echo "RAG index uploaded."

echo "Uploading disease index to s3://$S3_BUCKET/disease_index/ ..."
aws s3 sync "$DISEASE_DIR/" "s3://$S3_BUCKET/disease_index/" \
  --region "$REGION" \
  --exclude "*.tmp"
echo "Disease index uploaded."

echo ""
echo "Done. Future EC2 restarts will download from S3 instead of rebuilding."
echo "Total S3 size:"
aws s3 ls "s3://$S3_BUCKET/" --recursive --human-readable --summarize \
  | tail -2
