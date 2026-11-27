#!/bin/bash
# ── Run MedGemma local preprocessor on your laptop ───────────────────────────
# Prerequisites:
#   pip install fastapi uvicorn boto3 pydicom Pillow numpy
#   export SAGEMAKER_ENDPOINT=curesense-medgemma
#   export AWS_DEFAULT_REGION=ap-southeast-2
#   export AWS_PROFILE=curesense
#
# Backend/.env must have:
#   MEDGEMMA_SERVICE_URL=http://localhost:5001

export SAGEMAKER_ENDPOINT="${SAGEMAKER_ENDPOINT:-curesense-medgemma}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-ap-southeast-2}"
export AWS_PROFILE="${AWS_PROFILE:-curesense}"

echo "Starting MedGemma local preprocessor..."
echo "  Preprocessing: this laptop (CPU)"
echo "  Model inference: SageMaker endpoint -> $SAGEMAKER_ENDPOINT"
echo "  Listening on: http://localhost:5001"
echo ""

cd "$(dirname "$0")/.."
uvicorn api.medgemma_local:app --host 0.0.0.0 --port 5001 --reload
