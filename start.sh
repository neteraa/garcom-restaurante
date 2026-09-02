#!/usr/bin/env bash
# Garçom IA — Script de inicialização
# Uso: ./start.sh [PORT]
# Default port: 8011

PORT="${1:-8011}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Detecta IP da máquina para exibir no console
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ipconfig getifaddr en0 2>/dev/null || echo "localhost")

cd "$SCRIPT_DIR/backend"

# Carrega .env se existir
[ -f .env ] && export $(grep -v '^#' .env | xargs) 2>/dev/null

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║           🍖  GARÇOM IA — JM ESPETINHOS          ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  🖥  Totem (cliente):  http://$IP:$PORT"
echo "  🔥 Cozinha:           http://$IP:$PORT/#/kitchen"
echo "  💰 Caixa:             http://$IP:$PORT/#/caixa"
echo "  🪑 Mesas:             http://$IP:$PORT/#/mesas"
echo "  📦 Estoque:           http://$IP:$PORT/#/estoque"
echo "  🛵 iFood:             http://$IP:$PORT/#/ifood"
echo ""
echo "  API docs:             http://$IP:$PORT/docs"
echo ""

# Instalar dependências Python se necessário
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "📦 Instalando dependências Python..."
    pip install -r requirements.txt --quiet
fi

exec python3 -m uvicorn main:app --host 0.0.0.0 --port "$PORT"
