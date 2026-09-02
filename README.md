# 🍢 Garçom IA — Totem de Autoatendimento

Sistema completo de totem de autoatendimento com IA para o **JM Espetinhos & Assados** (Itapeva-SP).  
A **Gabi** — atendente virtual em português BR nativo — recebe clientes, anota pedidos por voz e envia direto pra cozinha.

---

## 📐 Arquitetura

```
garcom-restaurante/
├── backend/          FastAPI (Python 3.10+)
│   ├── main.py       API + WebSocket + IA chat + reconhecimento facial
│   ├── requirements.txt
│   └── data/
│       ├── customers.json   base de clientes / embeddings faciais
│       ├── orders.json      pedidos
│       ├── menu_jm.json     cardápio real (importado do CardapioWeb)
│       └── faces/           fotos dos clientes cadastrados
│
└── frontend/         React + Vite
    └── src/
        ├── App.jsx       Totem do cliente (kiosk)
        ├── Kitchen.jsx   Painel da cozinha (TV)
        └── Caixa.jsx     Dashboard do caixa
```

**Portas:**

| Serviço  | Porta |
|----------|-------|
| Backend  | 8080  |
| Frontend | 5174  |

**Rotas frontend:**

| URL                               | Tela              |
|-----------------------------------|-------------------|
| `http://localhost:5174/`          | Totem cliente     |
| `http://localhost:5174/#/kitchen` | Cozinha           |
| `http://localhost:5174/#/caixa`   | Caixa (financeiro)|
| `http://localhost:5174/#/estoque` | Estoque 📦        |
| `http://localhost:5174/#/mesas`   | Mesas & Comandas 🪑 |
| `http://[IP]:5174/#/mesa/3`       | Cardápio mobile (QR da Mesa 3) 📱 |

---

## 🚀 Setup (macOS / Linux)

### 1. Pré-requisitos

- Python 3.10+
- Node.js 18+
- [Opcional] CUDA para GPU (face recognition mais rápido)

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # no Windows: venv\Scripts\activate
pip install -r requirements.txt

# Copie e edite o arquivo de variáveis de ambiente
cp ../.env.example .env
# Edite .env e adicione pelo menos OPENAI_API_KEY
```

### 3. Frontend

```bash
cd frontend
npm install
```

### 4. Subir tudo

```bash
# Opção 1 — script automático (macOS com duplo-clique)
./open-garcom-restaurante.command

# Opção 2 — manual
# Terminal 1:
cd backend && source venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8080

# Terminal 2:
cd frontend && npm run dev
```

Acesse: **http://localhost:5174**

### 5. Modo Kiosk (TV)

```bash
./start-kiosk-tv.command         # Abre Chrome em fullscreen no totem
./start-kitchen-display.command  # Abre Chrome em fullscreen no painel da cozinha
```

---

## 🐳 Docker Compose

```bash
# Copie o .env.example e configure
cp .env.example backend/.env

# Sobe backend + frontend
docker compose up --build
```

> **Nota:** O reconhecimento facial via MTCNN+FaceNet funciona bem em CPU. Para GPU, altere o Dockerfile do backend.

---

## 🔧 Configuração

### Variáveis de ambiente (`backend/.env`)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `OPENAI_API_KEY` | ✅ Sim | Chave da OpenAI (GPT-4o mini + fallback TTS) |
| `ELEVENLABS_API_KEY` | Não | Voz premium ElevenLabs (PT-BR) |
| `ELEVENLABS_ENABLED` | Não | `1` para habilitar ElevenLabs (padrão: `0`) |
| `ELEVENLABS_VOICE_ID` | Não | ID da voz ElevenLabs |
| `HEYGEN_API_KEY` | Não | Avatar de streaming HeyGen |

> O TTS funciona **grátis** via `edge-tts` (Microsoft Thalita, PT-BR nativo) mesmo sem configurar ElevenLabs ou OpenAI TTS.  
> O chat com IA **requer** `OPENAI_API_KEY`.

---

## 🎭 Modos de Avatar

| Modo | URL | Descrição |
|------|-----|-----------|
| SVG animado (padrão) | `?2d=1` | Gabi em SVG com estados emocionais |
| Foto real | `?photo=1` | Coloque foto em `frontend/public/avatars/attendant.jpg` |
| Vídeo real | `?video=1` | Coloque clipes em `frontend/public/videos/human/` |
| Auto-detect | (sem param) | Vídeo > Foto > SVG automático |

**Clipes para modo vídeo:** `idle.mp4`, `speaking.mp4`, `wave.mp4`, `thumbsup.mp4`, `listening.mp4`

---

## 🧠 Como funciona a IA

1. **Câmera** detecta rosto via MTCNN (PyTorch) e gera embedding FaceNet
2. **Reconhecimento**: compara embedding com base de clientes cadastrados (cosseno ≥ 0.62)
3. **Auto-start**: quando rosto engajado por ≥3s, Gabi inicia automaticamente
4. **Chat**: GPT-4o-mini com system prompt em PT-BR natural, funções de carrinho como tools
5. **TTS**: edge-tts (Microsoft Thalita, grátis) → ElevenLabs (opcional) → OpenAI TTS
6. **Cadastro automático**: quando cliente diz o nome, foto é salva na base para próximas visitas

---

## 📦 API Backend

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/menu` | GET | Lista o cardápio |
| `/api/chat` | POST | Envia mensagem e recebe resposta da Gabi |
| `/api/tts` | POST | Converte texto em áudio (MP3) |
| `/api/identify-face` | POST | Reconhece cliente por foto |
| `/api/register-face` | POST | Cadastra cliente por nome + foto |
| `/api/order` | POST | Cria pedido |
| `/api/order/status` | POST | Atualiza status do pedido |
| `/api/orders` | GET | Lista todos os pedidos |
| `/api/stats` | GET | Estatísticas do dia (caixa) |
| `/api/session/reset` | POST | Reseta sessão do totem |
| `/api/inventory` | GET | Estoque atual com status semáforo |
| `/api/inventory/restock` | POST | Repor estoque de um item |
| `/api/inventory/restock-batch` | POST | Reposição em lote ("abrir o dia") |
| `/api/inventory/adjust` | POST | Ajuste manual de quantidade |
| `/api/inventory/alerts` | GET | Itens baixos/zerados |
| `/api/inventory/report` | GET | Relatório de vendas do dia por item |
| `/api/inventory/reset-day` | POST | Zera contadores diários |
| `/ws` | WebSocket | Stream de detecção facial |
| `/ws/kitchen` | WebSocket | Pedidos, status e alertas de estoque em tempo real |

---

## 🍢 Cardápio

O cardápio é carregado de `backend/data/menu_jm.json` (importado do CardapioWeb).  
Se o arquivo não existir, um cardápio padrão de espetinhos é usado.

Para atualizar o cardápio, substitua o `menu_jm.json` e reinicie o backend.

---

## 🤝 Contribuindo

1. Fork o repositório
2. Crie uma branch: `git checkout -b feature/minha-feature`
3. Commit e push
4. Abra um Pull Request

---

*Desenvolvido para o JM Espetinhos & Assados — Itapeva/SP 🔥*
