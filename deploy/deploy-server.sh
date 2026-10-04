#!/bin/bash
# Deploy the PDF Editor Pro API to the EC2 host.
# Uploaded and executed by deploy/deploy-server.ps1. Safe to re-run: the
# on-server .env is preserved, so secrets are never overwritten by a deploy.
set -euo pipefail

APP_DIR=/opt/pdfpro
TARBALL=/tmp/pdfpro-server.tar.gz
SERVICE=pdfpro-api

echo '==> 1/5 preserve env + unpack'
sudo mkdir -p "$APP_DIR"

# The .env holds live secrets and is deliberately not in the tarball, so it has
# to survive the wipe below. Back it up, then put it straight back.
HAD_ENV=0
if [ -f "$APP_DIR/server/.env" ]; then
    sudo cp "$APP_DIR/server/.env" /tmp/pdfpro-env.backup
    sudo chmod 600 /tmp/pdfpro-env.backup
    HAD_ENV=1
fi

sudo rm -rf "$APP_DIR/server"
sudo tar -xzf "$TARBALL" -C "$APP_DIR"

if [ "$HAD_ENV" = "1" ]; then
    sudo mv /tmp/pdfpro-env.backup "$APP_DIR/server/.env"
    echo '    restored existing .env'
else
    echo '    no .env found — copying the example. EDIT IT, then re-run.'
    sudo cp "$APP_DIR/server/.env.example" "$APP_DIR/server/.env"
fi

id -u pdfpro-api >/dev/null 2>&1 || \
  sudo useradd --system --home-dir "$APP_DIR" --shell /sbin/nologin pdfpro-api
sudo chown -R pdfpro-api:pdfpro-api "$APP_DIR"
sudo chmod 600 "$APP_DIR/server/.env"

echo '==> 3/5 install + build'
cd "$APP_DIR/server"
# Dev dependencies are needed for the TypeScript build, then pruned away.
sudo -H -u pdfpro-api npm ci --no-audit --no-fund >/dev/null
sudo -H -u pdfpro-api npm run build 2>&1 | tail -2
sudo -H -u pdfpro-api npm prune --omit=dev >/dev/null

echo '==> 4/5 restart'
sudo systemctl restart "$SERVICE"
sleep 3
sudo systemctl is-active --quiet "$SERVICE" || { sudo journalctl -u "$SERVICE" -n 30 --no-pager; exit 1; }

echo '==> 5/5 health'
curl -s -o /dev/null -w '    api health: %{http_code}\n' http://127.0.0.1:4000/api/health
echo '==> DONE'
