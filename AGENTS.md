# Garçom IA — AGENTS.md

## Visão Geral

Totem de autoatendimento com IA para o **JM Espetinhos & Assados** (Itapeva-SP).  
Atendente virtual: **Gabi** — voz PT-BR nativo, reconhecimento facial, pedidos por voz.

## Stack

- **Backend**: Python 3.10+ / FastAPI / Uvicorn / PyTorch (CPU)
- **IA Chat**: OpenAI GPT-4o-mini com function calling (ferramentas de carrinho)
- **TTS**: edge-tts (Microsoft Thalita, PT-BR, grátis) → ElevenLabs (opt-in) → OpenAI TTS
- **Face Recognition**: MTCNN (detecção) + FaceNet InceptionResnetV1 (embedding)
- **Frontend**: React 18 / Vite 5 / Lucide Icons / qrcode.react
- **WebSocket**: presença em tempo real + notificações de cozinha

## Arquitetura de Arquivos

```
backend/main.py          API principal (1460 linhas)
backend/data/
  menu_jm.json           Cardápio real do JM (importado do CardapioWeb)
  customers.json         Base de clientes com embeddings faciais (FaceNet 512-dim)
  orders.json            Pedidos do dia
  faces/                 Fotos dos clientes para referência

frontend/src/
  App.jsx                Totem principal (kiosk fullscreen)
  Kitchen.jsx            Painel da cozinha (WebSocket)
  Caixa.jsx              Dashboard caixa (stats, top vendas, faturamento por hora)
  components/
    GabiAvatar.jsx       Avatar SVG animado com estados emocionais + idle behaviors
    AvatarPhoto.jsx      Modo foto real com lip-sync por overlay CSS
    AvatarVideo.jsx      Modo vídeo real com clipes por estado (idle/speaking/wave/etc)
```

## Fluxo do Totem (App.jsx)

1. **Idle**: câmera detecta rosto via WebSocket → `engagedSinceRef` conta 3s → `start()` auto
2. **Identificação**: `/api/identify-face` → cliente conhecido (retorno personalizado) ou novo
3. **Loop de conversa**: `listen()` → `chat()` → `speak()` — até 25 turnos por sessão
4. **Confirmação**: GPT chama `confirm_order` → `/api/order` → WebSocket broadcast cozinha
5. **Ticket**: overlay com QR code e número de senha (#{orderId})
6. **Auto-reset**: 30s sem presença após pedido confirmado → nova sessão

## Endpoints Principais

| Endpoint | Uso |
|----------|-----|
| `GET /api/menu` | Cardápio completo |
| `POST /api/chat` | Chat com Gabi (GPT + carrinho) |
| `POST /api/tts` | TTS → MP3 bytes |
| `POST /api/identify-face` | Reconhecer cliente por foto |
| `POST /api/register-face` | Cadastrar cliente (nome + foto) |
| `GET /api/stats` | Stats do dia para o caixa |
| `POST /api/order/status` | Atualizar status pedido (cozinha) |
| `WS /ws` | Stream de detecção facial |
| `WS /ws/kitchen` | Novos pedidos + updates de status |

## Regras de Código

- **Plurais PT-BR**: `menu_jm.json` tem campo `plural` com forma plural correta (corrigida em set/2026). A função `_cart_summary()` usa esse campo para fala natural.
- **Gênero gramatical**: campo `gender: "m"/"f"` no menu. `qty_word()` gera "um"/"uma", "dois"/"duas", etc.
- **TTS**: usar `speakify()` antes de enviar pro TTS — remove símbolos, expande R$, #, ×, c/, etc.
- **Sessões**: chave = `session_id` (UUID por aba do browser). Estado em memória no backend (`sessions` dict).
- **Face threshold**: `0.62` (cosseno) — balanço entre reconhecer volta e não confundir pessoas.
- **Avatar modes**: query param `?2d=1` (SVG), `?photo=1`, `?video=1`. Auto-detect via HEAD request.
- **API URLs**: relativas (sem `localhost:8080`) — proxy via Vite dev server ou nginx no Docker.

## Variáveis de Ambiente

Arquivo: `backend/.env`

```
OPENAI_API_KEY=sk-...          # Obrigatório para chat
ELEVENLABS_API_KEY=             # Opcional (TTS premium)
ELEVENLABS_ENABLED=0            # 1 para habilitar ElevenLabs
HEYGEN_API_KEY=                 # Opcional (avatar streaming)
```

## Deploy

- **Local**: `./open-garcom-restaurante.command` (macOS) — sobe backend + frontend + abre Safari
- **Kiosk TV**: `./start-kiosk-tv.command` — Chrome em fullscreen
- **Cozinha**: `./start-kitchen-display.command` — Chrome em fullscreen
- **Docker**: `docker compose up --build`

## Notas de Desenvolvimento

- O backend carrega `facenet-pytorch` no startup (leva ~5s). Logs mostram "Loading face detection model (MTCNN)..."
- `menu_jm.json` sobrescreve o MENU hardcoded no `main.py` se existir.
- Pedidos ficam em `orders.json` e são carregados na memória no startup.
- O sistema detecta "itens crus" (categoria para levar pra casa) e os exclui das sugestões normais.
- Combos e itens com qtd no nome não recebem plural automaticamente.
- Anti-eco: filtros em `isGabiEcho()` e `ECHO_FILTERS` no background listener evitam que a voz da Gabi dispare nova sessão.
