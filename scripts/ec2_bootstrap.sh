#!/bin/bash
# ── CureSense AI — one-time EC2 setup (run as ubuntu user via SSH) ────────────
# Deep Learning AMI (Ubuntu 22.04, PyTorch 2.7) already has CUDA + PyTorch.
# This script: installs deps, clones repo, sets up systemd service.
#
# Usage:
#   chmod +x ec2_bootstrap.sh
#   ./ec2_bootstrap.sh

set -euo pipefail

REPO_URL="https://github.com/moizaimran/curesense-project.git"
BRANCH="hassan-branch"
APP_DIR="/opt/curesense/app"
RAG_DIR="/opt/curesense/rag_index"
DISEASE_DIR="/opt/curesense/disease_index"
S3_BUCKET="curesense-ai-indexes"
REGION="ap-southeast-2"

echo "=== [1/6] System packages ==="
sudo apt-get update -q
sudo apt-get install -y -q git python3-pip gunicorn

echo "=== [2/6] Clone repo ==="
sudo mkdir -p "$APP_DIR" "$RAG_DIR" "$DISEASE_DIR"
sudo chown -R ubuntu:ubuntu /opt/curesense
git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"

echo "=== [3/6] Install Python dependencies ==="
cd "$APP_DIR"
pip install -r requirements.txt -q
pip install gunicorn -q

echo "=== [4/6] Write environment config ==="
sudo mkdir -p /etc/curesense
sudo tee /etc/curesense/env > /dev/null <<EOF
RAG_INDEX_DIR=$RAG_DIR
DISEASE_INDEX_DIR=$DISEASE_DIR
S3_INDEX_BUCKET=$S3_BUCKET
AWS_DEFAULT_REGION=$REGION
REPO_DIR=$APP_DIR
EOF
echo "Environment config written to /etc/curesense/env"

echo "=== [5/6] Install systemd service ==="
sudo tee /etc/systemd/system/curesense-ai.service > /dev/null <<EOF
[Unit]
Description=CureSense AI Flask Service
After=network.target

[Service]
Type=simple
User=ubuntu
EnvironmentFile=/etc/curesense/env
WorkingDirectory=$APP_DIR
ExecStartPre=/bin/bash $APP_DIR/scripts/ec2_start.sh
ExecStart=/usr/local/bin/gunicorn --bind 0.0.0.0:5001 --workers 1 --threads 4 --timeout 300 api.app:app
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable curesense-ai

echo "=== [6/6] First run — sync indexes from S3 and start ==="
source /etc/curesense/env
bash "$APP_DIR/scripts/ec2_start.sh" &

echo ""
echo "=================================================="
echo " Bootstrap complete!"
echo " Service: sudo systemctl status curesense-ai"
echo " Logs:    sudo journalctl -u curesense-ai -f"
echo " URL:     http://<ELASTIC-IP>:5001"
echo "=================================================="
