# ==============================================================================
# sagemaker_medgemma/deploy.py
#
# Deploy MedGemma 1.5-4B to a SageMaker real-time endpoint using raw boto3.
# No dependency on sagemaker.huggingface (removed in sagemaker 3.x).
#
# Run from /home/ubuntu/curesense-ai/:
#   export HF_TOKEN=hf_...
#   python sagemaker_medgemma/deploy.py
#
# Requires:
#   HF_TOKEN env var — HuggingFace token with access to google/medgemma-1.5-4b-it
#   AWS credentials  — EC2 instance role S3iamuserforec2 with AmazonSageMakerFullAccess
# ==============================================================================

import os
import tarfile
import boto3

REGION        = "ap-southeast-2"
ACCOUNT_ID    = "593964940466"
ROLE_ARN      = f"arn:aws:iam::{ACCOUNT_ID}:role/curesense-sagemaker-role"
INSTANCE_TYPE = "ml.g4dn.xlarge"
ENDPOINT_NAME = "curesense-medgemma"
MODEL_NAME    = "curesense-medgemma-model"
CONFIG_NAME   = "curesense-medgemma-config"
S3_BUCKET     = f"sagemaker-{REGION}-{ACCOUNT_ID}"
S3_KEY        = "curesense-medgemma/model.tar.gz"
HF_TOKEN      = os.environ.get("HF_TOKEN", "")

# HuggingFace GPU inference DLC — PyTorch 2.1, transformers 4.37, Python 3.10, CUDA 11.8
# Account 763104351884 is the AWS DLC account (all regions)
IMAGE_URI = (
    f"763104351884.dkr.ecr.{REGION}.amazonaws.com/"
    "huggingface-pytorch-inference:2.1.0-transformers4.37.0-gpu-py310-cu118-ubuntu20.04"
)

if not HF_TOKEN:
    raise ValueError("Set HF_TOKEN env var: export HF_TOKEN=hf_...")

s3 = boto3.client("s3", region_name=REGION)
sm = boto3.client("sagemaker", region_name=REGION)

# ── 1. Package inference.py into model.tar.gz ─────────────────────────────────
# SageMaker extracts this into /opt/ml/model/; inference.py must be at code/inference.py
print("Packaging inference code ...")
tar_path = "/tmp/model.tar.gz"
script_dir = os.path.join(os.path.dirname(__file__), "code")
with tarfile.open(tar_path, "w:gz") as tar:
    tar.add(os.path.join(script_dir, "inference.py"), arcname="code/inference.py")
print(f"  -> {tar_path}")

# ── 2. Create S3 bucket (idempotent) + upload ─────────────────────────────────
print(f"Ensuring S3 bucket s3://{S3_BUCKET} ...")
try:
    s3.head_bucket(Bucket=S3_BUCKET)
except s3.exceptions.ClientError:
    s3.create_bucket(
        Bucket=S3_BUCKET,
        CreateBucketConfiguration={"LocationConstraint": REGION},
    )
    print(f"  -> created bucket")

print(f"Uploading model.tar.gz to s3://{S3_BUCKET}/{S3_KEY} ...")
s3.upload_file(tar_path, S3_BUCKET, S3_KEY)
model_data_url = f"s3://{S3_BUCKET}/{S3_KEY}"
print(f"  -> {model_data_url}")

# ── 3. Create SageMaker model ─────────────────────────────────────────────────
# Delete previous model if exists (idempotent redeploy)
try:
    sm.delete_model(ModelName=MODEL_NAME)
    print(f"Deleted existing model {MODEL_NAME}")
except sm.exceptions.ClientError:
    pass

print(f"Creating SageMaker model {MODEL_NAME} ...")
sm.create_model(
    ModelName=MODEL_NAME,
    ExecutionRoleArn=ROLE_ARN,
    PrimaryContainer={
        "Image": IMAGE_URI,
        "ModelDataUrl": model_data_url,
        "Environment": {
            "HF_MODEL_ID"            : "google/medgemma-1.5-4b-it",
            "HF_TOKEN"               : HF_TOKEN,
            "HF_TASK"                : "image-text-to-text",
            "SAGEMAKER_PROGRAM"      : "inference.py",
            "SAGEMAKER_SUBMIT_DIRECTORY": "/opt/ml/model/code",
            "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
        },
    },
)
print("  -> model created")

# ── 4. Create endpoint config ─────────────────────────────────────────────────
try:
    sm.delete_endpoint_config(EndpointConfigName=CONFIG_NAME)
    print(f"Deleted existing endpoint config {CONFIG_NAME}")
except sm.exceptions.ClientError:
    pass

print(f"Creating endpoint config {CONFIG_NAME} ...")
sm.create_endpoint_config(
    EndpointConfigName=CONFIG_NAME,
    ProductionVariants=[
        {
            "VariantName"         : "AllTraffic",
            "ModelName"           : MODEL_NAME,
            "InitialInstanceCount": 1,
            "InstanceType"        : INSTANCE_TYPE,
        }
    ],
)
print("  -> config created")

# ── 5. Create / update endpoint ───────────────────────────────────────────────
existing = [e["EndpointName"] for e in sm.list_endpoints()["Endpoints"]]
if ENDPOINT_NAME in existing:
    print(f"Updating endpoint {ENDPOINT_NAME} ...")
    sm.update_endpoint(
        EndpointName=ENDPOINT_NAME,
        EndpointConfigName=CONFIG_NAME,
    )
else:
    print(f"Creating endpoint {ENDPOINT_NAME} ...")
    sm.create_endpoint(
        EndpointName=ENDPOINT_NAME,
        EndpointConfigName=CONFIG_NAME,
    )

print(
    f"\nEndpoint creation kicked off — takes ~10 minutes to reach InService.\n"
    f"Monitor:  aws sagemaker describe-endpoint --endpoint-name {ENDPOINT_NAME} "
    f"--region {REGION} --query 'EndpointStatus'\n"
    f"\nOnce InService, set in Backend/.env:\n"
    f"  MEDGEMMA_SERVICE_URL=sagemaker:{ENDPOINT_NAME}:{REGION}"
)
