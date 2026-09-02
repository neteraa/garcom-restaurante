#!/usr/bin/env bash
# Garçom IA — Script de inicialização
# Uso: ./start.sh [PORT]
# Default port: 8011

PORT="${1:-8011}"

cd "$(dirname "$0")/backend"

echo "🚀 Iniciando Garçom IA na porta $PORT..."
echo "   URL: http://localhost:$PORT"
echo "   Cozinha: http://localhost:$PORT/#/kitchen"
echo "   Mesas:   http://localhost:$PORT/#/mesas"
echo "   Estoque: http://localhost:$PORT/#/estoque"
echo "   Caixa:   http://localhost:$PORT/#/caixa"
echo ""

# Instalar dependências Python se necessário
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "📦 Instalando dependências Python..."
    pip install fastapi uvicorn pydantic numpy pillow edge-tts --quiet
fi

exec python3 -m uvicorn main:app --host 0.0.0.0 --port "$PORT"
