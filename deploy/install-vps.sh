#!/bin/bash
set -euo pipefail
APP_DIR="${1:-/opt/fx-scalp-agent}"

echo "==> Installing fx-scalp-agent to $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo rsync -a --exclude node_modules --exclude data --exclude .env ./ "$APP_DIR/"
cd "$APP_DIR"
cp -n .env.example .env || true
npm install --production

echo "==> systemd"
sudo cp deploy/fx-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable fx-agent
sudo systemctl restart fx-agent
sudo systemctl status fx-agent --no-pager || true

echo "Done. Logs: journalctl -u fx-agent -f"
