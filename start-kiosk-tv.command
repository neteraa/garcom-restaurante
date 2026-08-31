#!/bin/bash
# JM Espetinhos — TV Kiosk (avatar Gabi em fullscreen)
# Uso: dá duplo-clique. Precisa Chrome instalado.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🍢 JM ESPETINHOS — Modo TV Kiosk"
echo ""

# 1) Sobe backend + frontend
"$SCRIPT_DIR/open-garcom-restaurante.command" &

# Aguarda subir
echo "⏳ Aguardando servidor..."
for i in $(seq 1 30); do
  if curl -s http://localhost:5174/ >/dev/null 2>&1 && curl -s http://localhost:8080/api/menu >/dev/null 2>&1; then
    echo "✅ Servidor pronto"
    break
  fi
  sleep 1
done

# 2) Abre Chrome em modo kiosk (fullscreen, sem barras)
CHROME_APP="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -f "$CHROME_APP" ]; then
  echo "❌ Google Chrome não encontrado. Instale em https://www.google.com/chrome/"
  exit 1
fi

# Kiosk mode + user data isolado (não interfere com Chrome normal)
KIOSK_PROFILE="/tmp/jm-kiosk-profile"
mkdir -p "$KIOSK_PROFILE"

echo "🖥️  Abrindo Chrome em modo kiosk..."
"$CHROME_APP" \
  --kiosk \
  --user-data-dir="$KIOSK_PROFILE" \
  --autoplay-policy=no-user-gesture-required \
  --use-fake-ui-for-media-stream \
  --disable-features=TranslateUI \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --no-first-run \
  --no-default-browser-check \
  http://localhost:5174/

echo ""
echo "🎬 TV Kiosk rodando! ESC pra sair do fullscreen."
