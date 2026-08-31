#!/bin/bash
# Garçom Restaurante - MVP leve para bar/restaurante

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Usa o venv do Garçom original pra evitar instalar tudo de novo (facenet-pytorch, openai, torch)
SHARED_VENV="/Users/agn/CascadeProjects/emotion-monitor/backend/venv"

# Se tiver um venv local, usa ele
if [ -d "$BACKEND_DIR/venv" ]; then
  source "$BACKEND_DIR/venv/bin/activate"
elif [ -f "$SHARED_VENV/bin/activate" ]; then
  source "$SHARED_VENV/bin/activate"
  echo "🍺 Usando ambiente compartilhado do Garçom AI"
else
  echo "❌ Nenhum ambiente Python encontrado"
  exit 1
fi

# Garante diretório de dados
mkdir -p "$BACKEND_DIR/data/faces"

# Sobe backend na porta 8080
cd "$BACKEND_DIR"
export $(grep -v '^#' .env 2>/dev/null | xargs)
if ! lsof -ti :8080 >/dev/null 2>&1; then
  python -m uvicorn main:app --host 0.0.0.0 --port 8080 &
  BACKEND_PID=$!
  echo "🍺 Backend rodando (PID: $BACKEND_PID)"
  for i in $(seq 1 20); do
    if curl -s http://localhost:8080/api/menu >/dev/null 2>&1; then echo "✅ Backend pronto"; break; fi
    sleep 1
  done
else
  echo "🔧 Backend já rodando"
fi

# Sobe frontend na porta 5174
cd "$FRONTEND_DIR"
if ! lsof -ti :5174 >/dev/null 2>&1; then
  if [ ! -d node_modules ]; then
    echo "⏳ Instalando frontend..."
    npm install
  fi
  ./node_modules/.bin/vite --host --port 5174 &
  FRONTEND_PID=$!
  echo "🖥️ Frontend rodando (PID: $FRONTEND_PID)"
  for i in $(seq 1 15); do
    if curl -s http://localhost:5174/ >/dev/null 2>&1; then echo "✅ Frontend pronto"; break; fi
    sleep 1
  done
else
  echo "🖥️ Frontend já rodando"
fi

# Abre no navegador
open -a "Safari" "http://localhost:5174"

echo ""
echo "✅ Garçom Restaurante no ar!"
echo "   Acesse: http://localhost:5174"
echo ""
echo "Pressione Ctrl+C pra parar"

wait
