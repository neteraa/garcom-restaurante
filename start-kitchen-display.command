#!/bin/bash
# JM Espetinhos — Painel da Cozinha (fullscreen na tela da cozinha)

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "👨‍🍳 JM ESPETINHOS — Painel da Cozinha"

# Aguarda backend estar rodando (assumindo que TV kiosk já iniciou)
for i in $(seq 1 30); do
  if curl -s http://localhost:5174/ >/dev/null 2>&1; then break; fi
  sleep 1
done

CHROME_APP="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
KITCHEN_PROFILE="/tmp/jm-kitchen-profile"
mkdir -p "$KITCHEN_PROFILE"

"$CHROME_APP" \
  --kiosk \
  --user-data-dir="$KITCHEN_PROFILE" \
  --new-window \
  --no-first-run \
  --no-default-browser-check \
  --autoplay-policy=no-user-gesture-required \
  "http://localhost:5174/#/kitchen"
