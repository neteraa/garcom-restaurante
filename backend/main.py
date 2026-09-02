import asyncio
import base64
import json
import os
import re
import time
import uuid
from datetime import datetime
from io import BytesIO
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel

# Face recognition — optional: degrada graciosamente se torch não instalado
face_detector = None
face_encoder = None
FACE_ENABLED = False
try:
    import torch
    from facenet_pytorch import MTCNN, InceptionResnetV1
    print("Carregando modelo de detecção facial (MTCNN)...")
    face_detector = MTCNN(keep_all=True, device="cpu", post_process=False, min_face_size=80, thresholds=[0.7, 0.8, 0.85])
    face_encoder  = InceptionResnetV1(pretrained="vggface2").eval()
    FACE_ENABLED  = True
    print("✅ Face recognition carregado")
except Exception as e:
    print(f"⚠️  Face recognition desativado ({e}) — restante do sistema funciona normalmente")

# Paths
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
CUSTOMERS_FILE = DATA_DIR / "customers.json"
ORDERS_FILE = DATA_DIR / "orders.json"
FACES_DIR = DATA_DIR / "faces"
DATA_DIR.mkdir(exist_ok=True)
FACES_DIR.mkdir(exist_ok=True)

# Memory
if CUSTOMERS_FILE.exists():
    with open(CUSTOMERS_FILE, "r", encoding="utf-8") as f:
        customers = json.load(f)
else:
    customers = {}

if ORDERS_FILE.exists():
    with open(ORDERS_FILE, "r", encoding="utf-8") as f:
        orders = json.load(f)
else:
    orders = []


def save_customers():
    with open(CUSTOMERS_FILE, "w", encoding="utf-8") as f:
        json.dump(customers, f, indent=2, ensure_ascii=False)


def save_orders():
    with open(ORDERS_FILE, "w", encoding="utf-8") as f:
        json.dump(orders, f, indent=2, ensure_ascii=False)


# ─────────────────────────────────────────────────────────────────
# ESTOQUE — controle de estoque por item do cardápio
# ─────────────────────────────────────────────────────────────────
INVENTORY_FILE = DATA_DIR / "inventory.json"

def _default_inv_item(menu_item: dict) -> dict:
    return {
        "item_id":       menu_item["id"],
        "name":          menu_item["name"],
        "category":      menu_item.get("category", ""),
        "stock":         0,
        "low_threshold": 10,
        "sold_today":    0,
        "updated_at":    None,
    }

def _load_inventory() -> dict:
    if INVENTORY_FILE.exists():
        with open(INVENTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

inventory: dict = _load_inventory()

def save_inventory():
    with open(INVENTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(inventory, f, indent=2, ensure_ascii=False)

def decrement_inventory(items: list):
    """Desconta do estoque ao confirmar pedido. Chamado automaticamente."""
    changed = False
    for it in items:
        iid = it.get("id") or it.get("item_id")
        qty = int(it.get("qty", 1))
        if not iid:
            continue
        if iid not in inventory:
            # cria entrada dinâmica se ainda não existia
            menu_ref = next((m for m in MENU if m["id"] == iid), None)
            if menu_ref:
                inventory[iid] = _default_inv_item(menu_ref)
            else:
                inventory[iid] = {"item_id": iid, "name": iid, "category": "", "stock": 0, "low_threshold": 10, "sold_today": 0, "updated_at": None}
        entry = inventory[iid]
        entry["stock"]      = max(0, entry.get("stock", 0) - qty)
        entry["sold_today"] = entry.get("sold_today", 0) + qty
        entry["updated_at"] = datetime.now().isoformat()
        changed = True
    if changed:
        save_inventory()


# Menu JM Espetinhos & Assados - Itapeva/SP
# gender: "m" or "f". plural: nome no plural pra fala natural
MENU = [
    # Espetinhos (carro-chefe do JM)
    {"id": "esp-alcatra", "name": "Espetinho de Alcatra", "plural": "Espetinhos de Alcatra", "gender": "m", "price": 12.0, "category": "Espetinhos", "image": "🍢"},
    {"id": "esp-file", "name": "Espetinho de Filé Mignon", "plural": "Espetinhos de Filé Mignon", "gender": "m", "price": 15.0, "category": "Espetinhos", "image": "🍢"},
    {"id": "esp-frango", "name": "Espetinho de Frango", "plural": "Espetinhos de Frango", "gender": "m", "price": 10.0, "category": "Espetinhos", "image": "🍗"},
    {"id": "esp-frangobacon", "name": "Frango com Bacon", "plural": "Frangos com Bacon", "gender": "m", "price": 12.0, "category": "Espetinhos", "image": "🥓"},
    {"id": "esp-coracao", "name": "Espetinho de Coração", "plural": "Espetinhos de Coração", "gender": "m", "price": 10.0, "category": "Espetinhos", "image": "❤️"},
    {"id": "esp-kafta", "name": "Kafta", "plural": "Kaftas", "gender": "f", "price": 12.0, "category": "Espetinhos", "image": "🍢"},
    {"id": "esp-linguica", "name": "Linguiça Toscana", "plural": "Linguiças Toscanas", "gender": "f", "price": 10.0, "category": "Espetinhos", "image": "🌭"},
    {"id": "esp-queijo", "name": "Espetinho de Queijo", "plural": "Espetinhos de Queijo", "gender": "m", "price": 12.0, "category": "Espetinhos", "image": "🧀"},
    {"id": "esp-medalhao", "name": "Medalhão de Frango", "plural": "Medalhões de Frango", "gender": "m", "price": 13.0, "category": "Espetinhos", "image": "🍢"},

    # Lanches
    {"id": "x-burger", "name": "X-Burger", "plural": "X-Burgers", "gender": "m", "price": 22.0, "category": "Lanches", "image": "🍔"},
    {"id": "x-salada", "name": "X-Salada", "plural": "X-Saladas", "gender": "m", "price": 24.0, "category": "Lanches", "image": "🍔"},
    {"id": "x-frango", "name": "X-Frango", "plural": "X-Frangos", "gender": "m", "price": 25.0, "category": "Lanches", "image": "🍗"},
    {"id": "x-tudo", "name": "X-Tudo", "plural": "X-Tudos", "gender": "m", "price": 32.0, "category": "Lanches", "image": "🍔"},

    # Bebidas
    {"id": "cerveja-lata", "name": "Cerveja em Lata", "plural": "Cervejas em Lata", "gender": "f", "price": 8.0, "category": "Bebidas", "image": "🍺"},
    {"id": "cerveja-long", "name": "Cerveja Long Neck", "plural": "Cervejas Long Neck", "gender": "f", "price": 12.0, "category": "Bebidas", "image": "🍺"},
    {"id": "chopp", "name": "Chopp Gelado", "plural": "Chopps Gelados", "gender": "m", "price": 10.0, "category": "Bebidas", "image": "🍺"},
    {"id": "refri-lata", "name": "Refrigerante Lata", "plural": "Refrigerantes Lata", "gender": "m", "price": 6.0, "category": "Bebidas", "image": "🥤"},
    {"id": "refri-2l", "name": "Refrigerante 2 Litros", "plural": "Refrigerantes 2 Litros", "gender": "m", "price": 15.0, "category": "Bebidas", "image": "🥤"},
    {"id": "agua", "name": "Água Mineral", "plural": "Águas Minerais", "gender": "f", "price": 4.0, "category": "Bebidas", "image": "💧"},
    {"id": "suco", "name": "Suco Natural", "plural": "Sucos Naturais", "gender": "m", "price": 8.0, "category": "Bebidas", "image": "🍹"},

    # Acompanhamentos
    {"id": "farofa", "name": "Farofa", "plural": "Farofas", "gender": "f", "price": 8.0, "category": "Acompanhamentos", "image": "🌾"},
    {"id": "vinagrete", "name": "Vinagrete", "plural": "Vinagretes", "gender": "m", "price": 6.0, "category": "Acompanhamentos", "image": "🥗"},
    {"id": "mandioca", "name": "Mandioca Frita", "plural": "Mandiocas Fritas", "gender": "f", "price": 15.0, "category": "Acompanhamentos", "image": "🍟"},
    {"id": "pao-alho", "name": "Pão de Alho", "plural": "Pães de Alho", "gender": "m", "price": 12.0, "category": "Acompanhamentos", "image": "🍞"},
]

# Override MENU com cardápio real do JM (importado do cardapioweb) se existir
_MENU_JM_FILE = DATA_DIR / "menu_jm.json"
if _MENU_JM_FILE.exists():
    try:
        with open(_MENU_JM_FILE, "r", encoding="utf-8") as _f:
            _data = json.load(_f)
            _items = _data.get("items", _data) if isinstance(_data, dict) else _data
            if isinstance(_items, list) and _items:
                MENU = _items
                print(f"✅ Cardápio JM real carregado: {len(MENU)} itens de {_MENU_JM_FILE}")
    except Exception as _e:
        print(f"⚠️ Falha ao carregar menu_jm.json: {_e}")

# OpenAI for TTS
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

NUMBER_WORDS_F = {
    "1": "uma", "2": "duas", "3": "três", "4": "quatro", "5": "cinco",
    "6": "seis", "7": "sete", "8": "oito", "9": "nove", "10": "dez",
    "11": "onze", "12": "doze",
}
NUMBER_WORDS_M = {
    "1": "um", "2": "dois", "3": "três", "4": "quatro", "5": "cinco",
    "6": "seis", "7": "sete", "8": "oito", "9": "nove", "10": "dez",
    "11": "onze", "12": "doze",
}
# Default (generic) — use feminine as it's ambiguous fallback
NUMBER_WORDS = NUMBER_WORDS_F

def qty_word(qty: int, gender: str = "m") -> str:
    """Return spoken quantity in correct gender."""
    words = NUMBER_WORDS_M if gender == "m" else NUMBER_WORDS_F
    return words.get(str(qty), str(qty))

def speakify(text: str) -> str:
    """Convert written text to natural spoken text (remove symbols, expand abbreviations)."""
    if not text:
        return text
    t = text

    # Handle "N× ItemName" and "N ItemName" — pick article by ItemName gender
    def _qty_item(match):
        n = match.group(1)
        item_word = match.group(2)
        # Try to find item gender by matching item_word to a menu name
        item_word_low = item_word.lower()
        gender = "m"  # default
        for m in MENU:
            if item_word_low in m["name"].lower() or item_word_low in m.get("plural", "").lower():
                gender = m.get("gender", "m")
                break
        # Special common words that are unambiguous
        if any(w in item_word_low for w in ["cerveja", "kafta", "linguiça", "farofa", "água", "mandioca"]):
            gender = "f"
        if any(w in item_word_low for w in ["chopp", "espetinho", "medalhão", "refrigerante", "suco", "pão", "burger", "hambúrguer"]):
            gender = "m"
        return f"{qty_word(int(n), gender)} {item_word}"

    # Pattern: "2× Espetinho" or "2 Espetinho"
    t = re.sub(r"(\d+)\s*[x×✕✖X]?\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s\-]{2,40}?)(?=[,.;!?]|\s+e\s|\s+ou\s|$)", _qty_item, t)

    # Standalone × → spaces
    t = t.replace("×", " ").replace("✕", " ").replace("✖", " ")
    # c/ → com   (e.g. "Frango c/ Bacon" → "Frango com Bacon")
    t = re.sub(r"\bc/\s*", "com ", t)
    # s/ → sem
    t = re.sub(r"\bs/\s*", "sem ", t)
    # R$ 12.00 or R$ 12,00 → "12 reais"
    t = re.sub(r"R\$\s*(\d+)[.,]?(\d*)", lambda m: (f"{m.group(1)} reais e {m.group(2)} centavos" if m.group(2) and m.group(2) != "00" else f"{m.group(1)} reais"), t)
    # # sign → "número"
    t = re.sub(r"#\s*(\w+)", r"número \1", t)
    # Collapse extra spaces
    t = re.sub(r"\s+", " ", t).strip()
    return t


async def tts_speak(text: str, voice: str = "pt-BR-ThalitaNeural"):
    """TTS pipeline: edge-tts pt-BR (grátis, sotaque BR nativo) → ElevenLabs (opt-in) → OpenAI.
    ElevenLabs só é usado se ELEVENLABS_ENABLED=1 no .env (evita gastar créditos e sotaque PT-PT)."""
    text = speakify(text)

    # 1) edge-tts (Microsoft Thalita — PT-BR NATIVO, grátis)
    try:
        import edge_tts
        communicate = edge_tts.Communicate(text, voice, rate="+5%")
        audio = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio += chunk["data"]
        if audio:
            return audio
    except Exception as e:
        print(f"edge-tts error: {e}")

    # 2) ElevenLabs (só se explicitamente habilitado — gasta créditos)
    el_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if el_key and os.getenv("ELEVENLABS_ENABLED", "0") == "1":
        try:
            import urllib.request as _u
            import urllib.error as _ue
            voice_id = os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL").strip()
            model_id = os.getenv("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2").strip()
            body = json.dumps({
                "text": text,
                "model_id": model_id,
                "voice_settings": {
                    "stability": 0.45,
                    "similarity_boost": 0.75,
                    "style": 0.35,
                    "use_speaker_boost": True,
                },
            }).encode()
            req = _u.Request(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_64",
                data=body,
                method="POST",
                headers={
                    "xi-api-key": el_key,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
            )
            with _u.urlopen(req, timeout=25) as r:
                audio = r.read()
            if audio:
                return audio
        except _ue.HTTPError as e:
            print(f"ElevenLabs HTTP {e.code}: {e.read()[:200]!r}")
        except Exception as e:
            print(f"ElevenLabs error: {e}")

    # 3) OpenAI TTS
    if OPENAI_API_KEY:
        try:
            import openai
            client = openai.OpenAI(api_key=OPENAI_API_KEY)
            resp = client.audio.speech.create(model="tts-1", voice="nova", input=text)
            return resp.content
        except Exception as e:
            print(f"OpenAI TTS fallback error: {e}")
    return None


# Helpers

def decode_frame(b64: str) -> Image.Image:
    data = b64.split(",")[-1]
    img = Image.open(BytesIO(base64.b64decode(data))).convert("RGB")
    return img


def encode_frame(img: Image.Image) -> str:
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode()


def get_face_embedding(img: Image.Image, box):
    """Crop face and get embedding. MTCNN returns [x1, y1, x2, y2] pixel coords."""
    x1, y1, x2, y2 = [int(v) for v in box]
    # Sanity check + margin
    w, h = img.size
    x1 = max(0, x1); y1 = max(0, y1)
    x2 = min(w, x2); y2 = min(h, y2)
    if x2 - x1 < 20 or y2 - y1 < 20:
        return None
    crop = img.crop((x1, y1, x2, y2)).resize((160, 160))
    arr = np.array(crop).astype(np.float32) / 255.0
    arr = (arr - 0.5) / 0.5
    if not FACE_ENABLED:
        return None
    import torch as _torch
    tensor = _torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0)
    with _torch.no_grad():
        emb = face_encoder(tensor)
    return emb.squeeze().numpy()


def cosine_similarity(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


BLOCKED_NAMES = {"gabi", "gaby", "gabby", "gabriela", "gabriella"}  # nome da atendente


def normalize_name(raw: str) -> str:
    """Normalize name for storage: strip, single space, title case, first name only.
    Returns empty string if it's the assistant's own name."""
    n = re.sub(r"[^\w\s]", "", raw or "").strip()
    n = re.sub(r"\s+", " ", n)
    if not n:
        return ""
    first = n.split()[0]
    if first.lower() in BLOCKED_NAMES:
        return ""  # rejeita — cliente não pode se chamar Gabi
    return first.capitalize()


def recognize_face(embedding, threshold=0.62):  # 0.62 = balance entre reconhecer volta e não confundir
    best = None
    best_score = 0.0
    for name, data in customers.items():
        for emb in data.get("embeddings", []):
            score = cosine_similarity(embedding, np.array(emb))
            if score > best_score:
                best_score = score
                best = name
    if best and best_score >= threshold:
        return best, best_score
    return None, best_score


# FastAPI app
app = FastAPI(title="Garçom Restaurante")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TTSRequest(BaseModel):
    text: str


class OrderRequest(BaseModel):
    customer_id: str
    items: list
    total: float
    notes: str = ""


class RegisterRequest(BaseModel):
    name: str
    frame: str


@app.get("/api/menu")
def get_menu():
    return {"items": MENU}


@app.get("/api/customers")
def list_customers():
    return {"customers": [{"id": k, **v} for k, v in customers.items()]}


@app.post("/api/identify-face")
async def identify_face(payload: dict):
    """Given a base64 frame, detect and identify face(s)."""
    if not FACE_ENABLED:
        return {"ok": False, "status": "disabled", "message": "Face recognition não disponível neste servidor."}
    if not payload.get("frame"):
        return {"ok": False, "error": "no frame"}
    img = decode_frame(payload["frame"])
    boxes, _ = face_detector.detect(img)
    if boxes is None or len(boxes) == 0:
        return {"ok": False, "status": "no_face", "message": "Não estou vendo ninguém. Aproxime-se da câmera."}

    n_faces = len(boxes)

    # Find biggest face (the one closest to camera = who's ordering)
    areas = [(b[2] - b[0]) * (b[3] - b[1]) for b in boxes]
    idx = int(np.argmax(areas))
    box = boxes[idx]
    embedding = get_face_embedding(img, box)
    if embedding is None:
        return {"ok": False, "status": "error", "message": "Não consegui capturar seu rosto direito."}

    name, score = recognize_face(embedding)
    # Ignora se foi reconhecido como blocked name (Gabi etc.) — safety net
    if name and name.lower() in BLOCKED_NAMES:
        print(f"⚠️  identify-face reconheceu blocked name '{name}', ignorando")
        name = None
    if name:
        person = customers[name]
        return {
            "ok": True,
            "status": "known",
            "name": name,
            "confidence": round(score * 100, 1),
            "history": person.get("history", []),
            "n_faces": n_faces,
            "message": f"Bem-vindo de volta, {name}!",
        }
    return {
        "ok": True,
        "status": "unknown",
        "n_faces": n_faces,
        "message": "Não te conheço ainda. Qual é o seu nome?",
    }


@app.post("/api/register-face")
async def register_face(req: RegisterRequest):
    if not FACE_ENABLED:
        return {"ok": False, "error": "Face recognition não disponível."}
    img = decode_frame(req.frame)
    boxes, _ = face_detector.detect(img)
    if boxes is None or len(boxes) == 0:
        return {"ok": False, "error": "no face"}

    # Use largest face
    areas = [(b[2] - b[0]) * (b[3] - b[1]) for b in boxes]
    box = boxes[np.argmax(areas)]
    embedding = get_face_embedding(img, box)
    if embedding is None:
        return {"ok": False, "error": "embedding failed"}

    name = normalize_name(req.name)
    if not name:
        return {"ok": False, "error": "invalid name"}

    # If a very similar face already exists under a different name, MERGE into that name
    existing_name, existing_score = recognize_face(embedding, threshold=0.55)
    if existing_name and existing_name.lower() != name.lower():
        # Merge: prefer the newer/human-provided name if it's non-empty and short
        # Move embeddings from existing_name → name (or keep existing_name and just add this embedding)
        # Simpler: keep existing_name (already recognized) — but add a name alias
        print(f"⚠️  Face matched '{existing_name}' but new name is '{name}'. Merging embeddings under '{name}'.")
        old = customers.pop(existing_name, {})
        customers.setdefault(name, {"name": name, "created_at": datetime.now().isoformat(), "embeddings": [], "history": [], "photo": None})
        customers[name]["embeddings"].extend(old.get("embeddings", []))
        customers[name]["history"] = old.get("history", []) + customers[name].get("history", [])

    # Save thumbnail
    thumb_id = str(uuid.uuid4())[:8]
    crop = img.crop((int(box[0]), int(box[1]), int(box[2]), int(box[3])))
    thumb_path = FACES_DIR / f"{thumb_id}.jpg"
    crop.save(thumb_path, quality=85)

    if name not in customers:
        customers[name] = {"name": name, "created_at": datetime.now().isoformat(), "embeddings": [], "history": [], "photo": str(thumb_path)}

    # Cap embeddings to last 10 to keep JSON small
    customers[name]["embeddings"].append(embedding.tolist())
    customers[name]["embeddings"] = customers[name]["embeddings"][-10:]
    customers[name]["last_seen"] = datetime.now().isoformat()
    customers[name]["photo"] = str(thumb_path)
    save_customers()

    return {"ok": True, "name": name, "n_embeddings": len(customers[name]["embeddings"]), "message": f"Prazer, {name}! Agora eu te reconheço."}


async def broadcast_new_order(order: dict):
    """Send a newly-created order to all connected kitchen displays."""
    for ws in list(kitchen_clients):
        try:
            await ws.send_text(json.dumps({"type": "new", "order": order}))
        except Exception:
            kitchen_clients.discard(ws)

async def broadcast_inventory_alerts(items: list):
    """Avisa a cozinha quando itens do pedido ficam com estoque baixo/zerado."""
    alerts = []
    for it in items:
        iid = it.get("id") or it.get("item_id")
        if not iid or iid not in inventory:
            continue
        inv = inventory[iid]
        stock = inv.get("stock", 0)
        thr   = inv.get("low_threshold", 10)
        if stock == 0:
            alerts.append({"item_id": iid, "name": inv.get("name", iid), "stock": 0, "level": "out"})
        elif stock <= thr:
            alerts.append({"item_id": iid, "name": inv.get("name", iid), "stock": stock, "level": "low"})
    if not alerts:
        return
    msg = json.dumps({"type": "inventory_alert", "alerts": alerts})
    for ws in list(kitchen_clients):
        try:
            await ws.send_text(msg)
        except Exception:
            kitchen_clients.discard(ws)


@app.post("/api/order")
async def create_order(req: OrderRequest):
    order = {
        "id": str(uuid.uuid4())[:8],
        "customer_id": req.customer_id,
        "items": req.items,
        "total": req.total,
        "notes": req.notes,
        "status": "preparing",
        "created_at": datetime.now().isoformat(),
    }
    orders.append(order)
    save_orders()
    decrement_inventory(req.items)
    await broadcast_inventory_alerts(req.items)
    if req.customer_id in customers:
        names = [it["name"] for it in req.items]
        customers[req.customer_id]["history"].insert(0, {"items": names, "total": req.total, "date": order["created_at"]})
        customers[req.customer_id]["history"] = customers[req.customer_id]["history"][:20]
        save_customers()
    await broadcast_new_order(order)
    return {"ok": True, "order": order}


@app.get("/api/orders")
def list_orders():
    return {"orders": sorted(orders, key=lambda x: x["created_at"], reverse=True)[:50]}


@app.get("/api/stats")
def get_stats():
    """Real-time cash-flow / sales summary."""
    from collections import Counter, defaultdict
    now = datetime.now()
    today_str = now.date().isoformat()

    today_orders = [o for o in orders if o.get("created_at", "").startswith(today_str)]
    active_orders = [o for o in orders if o.get("status") in ("preparing", "ready")]

    # Exclude canceled from revenue
    valid_today = [o for o in today_orders if o.get("status") != "canceled"]
    total_today = sum(o.get("total", 0) for o in valid_today)
    ticket_avg = (total_today / len(valid_today)) if valid_today else 0

    # Top items today
    item_counter = Counter()
    item_revenue = defaultdict(float)
    for o in valid_today:
        for it in o.get("items", []):
            item_counter[it["name"]] += it.get("qty", 1)
            item_revenue[it["name"]] += it.get("total", it.get("price", 0) * it.get("qty", 1))
    top_items = [
        {"name": n, "qty": q, "revenue": round(item_revenue[n], 2)}
        for n, q in item_counter.most_common(6)
    ]

    # Hourly buckets (last 12 hours)
    hour_buckets = defaultdict(lambda: {"count": 0, "revenue": 0.0})
    for o in valid_today:
        try:
            h = datetime.fromisoformat(o["created_at"]).hour
            hour_buckets[h]["count"] += 1
            hour_buckets[h]["revenue"] += o.get("total", 0)
        except Exception:
            pass
    hours_series = [
        {"hour": h, "count": hour_buckets[h]["count"], "revenue": round(hour_buckets[h]["revenue"], 2)}
        for h in sorted(hour_buckets.keys())
    ]

    # Status breakdown
    status_counts = Counter(o.get("status", "unknown") for o in today_orders)

    # Recent 8 orders
    recent = sorted(today_orders, key=lambda x: x["created_at"], reverse=True)[:8]
    recent_min = [{
        "id": o["id"], "customer": o.get("customer_id") or "Anônimo",
        "total": o.get("total", 0), "status": o.get("status"),
        "created_at": o.get("created_at"), "items_count": len(o.get("items", [])),
    } for o in recent]

    return {
        "date": today_str,
        "total_today": round(total_today, 2),
        "orders_today": len(valid_today),
        "orders_canceled": len(today_orders) - len(valid_today),
        "ticket_avg": round(ticket_avg, 2),
        "active_count": len(active_orders),
        "top_items": top_items,
        "hours_series": hours_series,
        "status_counts": dict(status_counts),
        "recent": recent_min,
        "customers_total": len(customers),
    }


# ─────────────────────────────────────────────────────────────────
# ESTOQUE — endpoints
# ─────────────────────────────────────────────────────────────────

@app.get("/api/inventory")
def get_inventory():
    """Retorna estoque atual de todos os itens do cardápio."""
    result = []
    today_str = datetime.now().strftime("%Y-%m-%d")
    for m in MENU:
        iid = m["id"]
        inv = inventory.get(iid, {})
        stock = inv.get("stock", 0)
        low_thr = inv.get("low_threshold", 10)

        # Vendas do dia calculadas do inventory (pode ser 0 se nunca reposto)
        sold_today = inv.get("sold_today", 0)

        # Status semaforo
        if stock == 0:
            status = "out"
        elif stock <= low_thr:
            status = "low"
        elif stock <= low_thr * 2:
            status = "warning"
        else:
            status = "ok"

        result.append({
            "item_id":      iid,
            "name":         m["name"],
            "category":     m.get("category", ""),
            "image":        m.get("image", ""),
            "photo":        m.get("thumb") or m.get("photo") or "",
            "price":        m.get("price", 0),
            "stock":        stock,
            "low_threshold": low_thr,
            "sold_today":   sold_today,
            "status":       status,
            "updated_at":   inv.get("updated_at"),
        })
    return {"items": result, "generated_at": datetime.now().isoformat()}


class InventoryRestockRequest(BaseModel):
    # Repor estoque de UM item
    item_id: str
    qty: int
    notes: str = ""

@app.post("/api/inventory/restock")
async def restock_item(req: InventoryRestockRequest):
    """Adiciona quantidade ao estoque de um item (ex.: 'fiz mais 50 espetinhos')."""
    m = next((x for x in MENU if x["id"] == req.item_id), None)
    if req.item_id not in inventory:
        inventory[req.item_id] = _default_inv_item(m) if m else {
            "item_id": req.item_id, "name": req.item_id, "category": "", "stock": 0, "low_threshold": 10, "sold_today": 0, "updated_at": None
        }
    inventory[req.item_id]["stock"] = inventory[req.item_id].get("stock", 0) + req.qty
    inventory[req.item_id]["updated_at"] = datetime.now().isoformat()
    if req.notes:
        inventory[req.item_id]["last_restock_notes"] = req.notes
    save_inventory()
    return {"ok": True, "item_id": req.item_id, "new_stock": inventory[req.item_id]["stock"]}


class InventoryBatchRestockRequest(BaseModel):
    # Reposição em lote (abrir o dia: define o estoque inicial de vários itens)
    items: list  # [{"item_id": "...", "qty": 50}, ...]

@app.post("/api/inventory/restock-batch")
async def restock_batch(req: InventoryBatchRestockRequest):
    """Reposição em lote — ideal pra 'abrir o dia' e definir o estoque de todos de vez."""
    updated = []
    for entry in req.items:
        iid = entry.get("item_id")
        qty = int(entry.get("qty", 0))
        if not iid or qty <= 0:
            continue
        m = next((x for x in MENU if x["id"] == iid), None)
        if iid not in inventory:
            inventory[iid] = _default_inv_item(m) if m else {
                "item_id": iid, "name": iid, "category": "", "stock": 0, "low_threshold": 10, "sold_today": 0, "updated_at": None
            }
        inventory[iid]["stock"] = inventory[iid].get("stock", 0) + qty
        inventory[iid]["updated_at"] = datetime.now().isoformat()
        updated.append({"item_id": iid, "new_stock": inventory[iid]["stock"]})
    save_inventory()
    return {"ok": True, "updated": updated}


class InventoryAdjustRequest(BaseModel):
    item_id: str
    stock: int
    low_threshold: int = None

@app.post("/api/inventory/adjust")
async def adjust_inventory(req: InventoryAdjustRequest):
    """Ajuste manual direto (corrigir contagem errada)."""
    m = next((x for x in MENU if x["id"] == req.item_id), None)
    if req.item_id not in inventory:
        inventory[req.item_id] = _default_inv_item(m) if m else {
            "item_id": req.item_id, "name": req.item_id, "category": "", "stock": 0, "low_threshold": 10, "sold_today": 0, "updated_at": None
        }
    inventory[req.item_id]["stock"] = max(0, req.stock)
    if req.low_threshold is not None:
        inventory[req.item_id]["low_threshold"] = max(0, req.low_threshold)
    inventory[req.item_id]["updated_at"] = datetime.now().isoformat()
    save_inventory()
    return {"ok": True, "item_id": req.item_id, "stock": inventory[req.item_id]["stock"]}


@app.get("/api/inventory/alerts")
def get_inventory_alerts():
    """Itens com estoque baixo ou zerado — consumido pela cozinha em tempo real."""
    alerts = []
    for m in MENU:
        iid = m["id"]
        inv = inventory.get(iid, {})
        stock = inv.get("stock", 0)
        thr = inv.get("low_threshold", 10)
        if stock == 0 and inv:  # só alerta se o item foi reposto alguma vez
            alerts.append({"item_id": iid, "name": m["name"], "stock": 0, "level": "out", "category": m.get("category","")})
        elif 0 < stock <= thr:
            alerts.append({"item_id": iid, "name": m["name"], "stock": stock, "level": "low", "category": m.get("category","")})
    return {"alerts": alerts, "count": len(alerts)}


@app.post("/api/inventory/reset-day")
async def reset_day():
    """Zera o contador 'sold_today' — chamar no início de cada dia."""
    for iid in inventory:
        inventory[iid]["sold_today"] = 0
    save_inventory()
    return {"ok": True, "reset_at": datetime.now().isoformat()}


@app.get("/api/inventory/report")
def inventory_report():
    """Relatório de vendas do dia por item — melhor que o CardapioWeb 😎."""
    today_str = datetime.now().strftime("%Y-%m-%d")
    today_orders = [o for o in orders if o.get("created_at", "").startswith(today_str) and o.get("status") != "canceled"]

    # Agrupa vendas por item_id a partir dos pedidos do dia
    sales: dict = {}
    for o in today_orders:
        for it in o.get("items", []):
            iid = it.get("id") or it.get("item_id", "")
            if not iid:
                continue
            if iid not in sales:
                sales[iid] = {"item_id": iid, "name": it.get("name", iid), "qty": 0, "revenue": 0.0}
            sales[iid]["qty"]     += it.get("qty", 1)
            sales[iid]["revenue"] += it.get("total", 0)

    # Enriquece com dados de estoque
    report_items = []
    for iid, s in sorted(sales.items(), key=lambda x: -x[1]["qty"]):
        inv = inventory.get(iid, {})
        report_items.append({
            **s,
            "stock_remaining": inv.get("stock", 0),
            "low_threshold":   inv.get("low_threshold", 10),
        })

    total_revenue = sum(s["revenue"] for s in sales.values())
    total_items   = sum(s["qty"]     for s in sales.values())

    return {
        "date":          today_str,
        "total_revenue": round(total_revenue, 2),
        "total_items":   total_items,
        "total_orders":  len(today_orders),
        "items":         report_items,
    }


def _menu_by_id(item_id: str):
    for m in MENU:
        if m["id"] == item_id:
            return m
    return None


# ─────────────────────────────────────────────────────────────────
# MESAS E COMANDAS — controle presencial de mesas
# ─────────────────────────────────────────────────────────────────

TABLES_FILE   = DATA_DIR / "tables.json"
COMANDAS_FILE = DATA_DIR / "comandas.json"

_DEFAULT_TABLES = [{"id": str(i), "name": f"Mesa {i}", "capacity": 4} for i in range(1, 13)]

def _load_tables_cfg() -> dict:
    if TABLES_FILE.exists():
        with open(TABLES_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"tables": _DEFAULT_TABLES}

def _load_comandas() -> dict:
    if COMANDAS_FILE.exists():
        with open(COMANDAS_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}

tables_cfg: dict = _load_tables_cfg()
comandas:   dict = _load_comandas()

def save_tables_cfg():
    with open(TABLES_FILE, "w", encoding="utf-8") as f:
        json.dump(tables_cfg, f, indent=2, ensure_ascii=False)

def save_comandas():
    with open(COMANDAS_FILE, "w", encoding="utf-8") as f:
        json.dump(comandas, f, indent=2, ensure_ascii=False)

def _comanda_total(cmd: dict) -> float:
    return round(sum(it["qty"] * it["price"] for it in cmd.get("items", [])), 2)

async def _broadcast_table(table_id: str):
    cmd = comandas.get(table_id, {})
    msg = json.dumps({
        "type":     "table_update",
        "table_id": table_id,
        "comanda":  {**cmd, "total": _comanda_total(cmd)},
    })
    for ws in list(kitchen_clients):
        try:
            await ws.send_text(msg)
        except Exception:
            kitchen_clients.discard(ws)


@app.get("/api/tables")
def list_tables():
    result = []
    for t in tables_cfg["tables"]:
        tid = t["id"]
        cmd = comandas.get(tid) if comandas.get(tid, {}).get("status") == "open" else None
        result.append({
            "id":            tid,
            "name":          t["name"],
            "capacity":      t.get("capacity", 4),
            "status":        "open" if cmd else "free",
            "customer_name": (cmd or {}).get("customer_name", ""),
            "opened_at":     (cmd or {}).get("opened_at"),
            "total":         _comanda_total(cmd) if cmd else 0.0,
            "items_count":   len((cmd or {}).get("items", [])),
        })
    return {"tables": result}


class TableOpenRequest(BaseModel):
    table_id: str
    customer_name: str = ""

@app.post("/api/tables/open")
async def open_table(req: TableOpenRequest):
    tid = req.table_id
    if comandas.get(tid, {}).get("status") == "open":
        return {"ok": False, "error": "Mesa já aberta"}
    comandas[tid] = {
        "table_id":     tid,
        "customer_name": req.customer_name.strip(),
        "opened_at":    datetime.now().isoformat(),
        "items":        [],
        "status":       "open",
    }
    save_comandas()
    await _broadcast_table(tid)
    return {"ok": True, "comanda": comandas[tid]}


@app.get("/api/tables/{table_id}")
def get_table(table_id: str):
    t_cfg = next((t for t in tables_cfg["tables"] if t["id"] == table_id), None)
    # Auto-cria configuração se não existir (ex: mesa adicionada depois)
    if not t_cfg:
        t_cfg = {"id": table_id, "name": f"Mesa {table_id}", "capacity": 4}
    cmd = comandas.get(table_id)
    is_open = bool(cmd and cmd.get("status") == "open")
    return {
        "ok":     True,
        "table":  t_cfg,
        "status": "open" if is_open else "free",
        "comanda": ({**cmd, "total": _comanda_total(cmd)} if is_open else None),
    }


class TableAddItemRequest(BaseModel):
    item_id: str
    qty: int = 1
    notes: str = ""

@app.post("/api/tables/{table_id}/add")
async def add_to_table(table_id: str, req: TableAddItemRequest):
    # Auto-abre mesa se ainda não abriu
    if comandas.get(table_id, {}).get("status") != "open":
        comandas[table_id] = {
            "table_id":     table_id,
            "customer_name": "",
            "opened_at":    datetime.now().isoformat(),
            "items":        [],
            "status":       "open",
        }

    m = _menu_by_id(req.item_id)
    if not m:
        return {"ok": False, "error": "Item não encontrado no cardápio"}

    # Agrupa com item igual (mesmo id e mesma nota)
    for it in comandas[table_id]["items"]:
        if it["id"] == req.item_id and it.get("notes", "") == req.notes:
            it["qty"] += req.qty
            save_comandas()
            await _broadcast_table(table_id)
            return {"ok": True, "comanda": {**comandas[table_id], "total": _comanda_total(comandas[table_id])}}

    comandas[table_id]["items"].append({
        "id":       req.item_id,
        "name":     m["name"],
        "image":    m.get("image", ""),
        "price":    m["price"],
        "qty":      req.qty,
        "notes":    req.notes,
        "added_at": datetime.now().isoformat(),
    })
    save_comandas()
    decrement_inventory([{"id": req.item_id, "qty": req.qty}])
    await broadcast_inventory_alerts([{"id": req.item_id}])

    # Envia pra cozinha como ordem de mesa
    kitchen_order = {
        "id":          str(uuid.uuid4())[:8],
        "customer_id": f"Mesa {table_id}" + (f" — {comandas[table_id]['customer_name']}" if comandas[table_id].get("customer_name") else ""),
        "table_id":    table_id,
        "items":       [{"id": req.item_id, "name": m["name"], "qty": req.qty, "price": m["price"], "total": round(m["price"] * req.qty, 2)}],
        "total":       round(m["price"] * req.qty, 2),
        "notes":       req.notes,
        "status":      "preparing",
        "type":        "table",
        "created_at":  datetime.now().isoformat(),
    }
    orders.append(kitchen_order)
    save_orders()
    await broadcast_new_order(kitchen_order)
    await _broadcast_table(table_id)

    return {"ok": True, "comanda": {**comandas[table_id], "total": _comanda_total(comandas[table_id])}}


@app.delete("/api/tables/{table_id}/item/{item_idx}")
async def remove_from_table(table_id: str, item_idx: int):
    if comandas.get(table_id, {}).get("status") != "open":
        return {"ok": False, "error": "Mesa não encontrada ou não está aberta"}
    items = comandas[table_id].get("items", [])
    if not (0 <= item_idx < len(items)):
        return {"ok": False, "error": "Índice inválido"}
    removed = items.pop(item_idx)
    save_comandas()
    await _broadcast_table(table_id)
    return {"ok": True, "removed": removed}


class TableCloseRequest(BaseModel):
    table_id: str
    payment_method: str = "dinheiro"  # dinheiro | pix | cartao | fiado

@app.post("/api/tables/close")
async def close_table(req: TableCloseRequest):
    cmd = comandas.get(req.table_id, {})
    if cmd.get("status") != "open":
        return {"ok": False, "error": "Mesa não está aberta"}
    total   = _comanda_total(cmd)
    order_id = None
    if cmd.get("items"):
        close_order = {
            "id":             str(uuid.uuid4())[:8],
            "customer_id":    f"Mesa {req.table_id}" + (f" — {cmd.get('customer_name','')}" if cmd.get("customer_name") else ""),
            "table_id":       req.table_id,
            "items":          [{"id": it["id"], "name": it["name"], "qty": it["qty"], "price": it["price"], "total": it["qty"] * it["price"]} for it in cmd["items"]],
            "total":          total,
            "payment_method": req.payment_method,
            "notes":          f"Fechamento Mesa {req.table_id}",
            "status":         "delivered",
            "type":           "table_close",
            "created_at":     cmd["opened_at"],
            "closed_at":      datetime.now().isoformat(),
        }
        orders.append(close_order)
        save_orders()
        order_id = close_order["id"]
    # Libera a mesa
    comandas[req.table_id] = {"status": "free", "last_closed": datetime.now().isoformat()}
    save_comandas()
    # Avisa cozinha que mesa fechou
    msg = json.dumps({"type": "table_close", "table_id": req.table_id, "total": total, "payment_method": req.payment_method})
    for ws in list(kitchen_clients):
        try: await ws.send_text(msg)
        except Exception: kitchen_clients.discard(ws)
    return {"ok": True, "total": total, "order_id": order_id, "payment_method": req.payment_method}


class TableConfigRequest(BaseModel):
    tables: list  # [{"id":"1","name":"Mesa 1","capacity":4}, ...]

@app.post("/api/tables/config")
async def configure_tables(req: TableConfigRequest):
    tables_cfg["tables"] = req.tables
    save_tables_cfg()
    return {"ok": True, "tables": tables_cfg["tables"]}


class OrderStatusRequest(BaseModel):
    order_id: str
    status: str  # preparing, ready, delivered, canceled


@app.post("/api/order/status")
async def update_order_status(req: OrderStatusRequest):
    for o in orders:
        if o["id"] == req.order_id:
            o["status"] = req.status
            o.setdefault("timeline", {})[req.status] = datetime.now().isoformat()
            save_orders()
            # Broadcast to kitchen WS clients
            for ws in list(kitchen_clients):
                try:
                    await ws.send_text(json.dumps({"type": "status", "order": o}))
                except Exception:
                    kitchen_clients.discard(ws)
            return {"ok": True, "order": o}
    return {"ok": False, "error": "not found"}


# ── Kitchen WebSocket clients ──
kitchen_clients: set = set()


@app.websocket("/ws/kitchen")
async def kitchen_ws(ws: WebSocket):
    await ws.accept()
    kitchen_clients.add(ws)
    try:
        # Send initial snapshot
        active = [o for o in orders if o.get("status") in ("preparing", "ready")]
        await ws.send_text(json.dumps({"type": "snapshot", "orders": sorted(active, key=lambda x: x["created_at"], reverse=True)[:20]}))
        while True:
            msg = await ws.receive_text()
            # kitchen sends ping / actions if needed
            data = json.loads(msg)
            if data.get("type") == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    finally:
        kitchen_clients.discard(ws)


@app.post("/api/tts")
async def text_to_speech(req: TTSRequest):
    audio = await tts_speak(req.text)
    if not audio:
        return {"ok": False, "error": "TTS unavailable"}
    return StreamingResponse(BytesIO(audio), media_type="audio/mpeg")


class ChatRequest(BaseModel):
    text: str
    session_id: str
    customer: str | None = None


# ── Session store ─────────────────────────────────────────────
# Each session has: history (list of messages), cart (list), customer, phase
sessions: dict = {}

def _get_session(sid: str):
    if sid not in sessions:
        sessions[sid] = {
            "history": [],
            "cart": [],  # [{id,name,price,qty,image}]
            "customer": None,
            "phase": "greeting",  # greeting -> ordering -> confirming -> done
            "pending_confirm": False,
            "last_mentioned": [],  # item_ids the assistant recently talked about (for "esse"/"aquele")
        }
    return sessions[sid]


def _is_combo_item(name_low: str) -> bool:
    """Detecta itens combo/composto (múltiplos produtos num nome só)."""
    if "+" in name_low or "," in name_low:
        return True
    if name_low.startswith("combo") or " combo " in name_low:
        return True
    # muitas palavras curtas / composto (ex: "1 pão de alho + 1 fraldinha ...")
    words = name_low.split()
    if len(words) >= 6:
        return True
    return False


def _extract_mentioned_items(text: str) -> list:
    """
    Retorna item_ids mencionados no texto.
    Match forte por nome completo; fallback por palavra-chave escolhendo
    APENAS UM item (o mais simples) por keyword — para evitar explodir combos.
    """
    if not text:
        return []
    text_low = text.lower()
    strong = []       # full-name substring matches
    strong_ids = set()
    keyword_hits = {} # keyword -> best (id, name_len)

    # PASS 1: full-name match (only non-combo items or user explicitly said "combo")
    user_wants_combo = "combo" in text_low
    user_wants_cru_p1 = re.search(r"\bcru\b|\bpra\s+levar\b|\bcongelad", text_low) is not None
    for m in MENU:
        name_low = m["name"].lower().strip()
        if len(name_low) < 3:
            continue
        is_combo = _is_combo_item(name_low)
        if is_combo and not user_wants_combo:
            continue
        if not user_wants_cru_p1 and re.search(r"\bcru\b|\bcrus\b", name_low):
            continue
        if name_low in text_low:
            if m["id"] not in strong_ids:
                strong.append(m["id"])
                strong_ids.add(m["id"])

    # PASS 2: keyword match — pick BEST menu item per keyword
    # Penaliza "cru" (categoria separada de espetinhos crus) e prefere item mais curto
    user_wants_cru = re.search(r"\bcru\b|\bpra\s+levar\b|\bcongelad", text_low) is not None
    for m in MENU:
        name_low = m["name"].lower().strip()
        if _is_combo_item(name_low) and not user_wants_combo:
            continue
        # Skip espetinhos crus a menos que user peça explicitamente
        if not user_wants_cru and re.search(r"\bcru\b|\bcrus\b", name_low):
            continue
        # tokens significativos: >=4 letras, ignora stop-words
        stop = {"espetinho","espeto","porcao","porção","com","sem","de","da","do","na","no","para","pra","artesanal","natural","gelada","gelado","bovina","bovino"}
        tokens = [t for t in re.findall(r"[a-zà-ÿ]{4,}", name_low) if t not in stop]
        for tok in tokens:
            if tok in text_low:
                # Score: menor = melhor. Penaliza nomes longos.
                score = len(name_low)
                best = keyword_hits.get(tok)
                if best is None or score < best[1]:
                    keyword_hits[tok] = (m["id"], score)
                break  # 1 keyword hit já basta pra esse item

    # Merge strong (full-name) hits first, then keyword hits
    result = list(strong)
    seen = set(strong)
    for tok, (iid, _) in keyword_hits.items():
        if iid not in seen:
            seen.add(iid)
            result.append(iid)
    return result


SYSTEM_PROMPT = """Você é a Gabi, a atendente virtual do JM Espetinhos & Assados, em Itapeva-SP. É a IA-atendente pioneira da cidade.

PERSONALIDADE (super importante):
- Do interior de São Paulo, animada, brincalhona, gente boa
- Faz piadinhas leves de vez em quando pra descontrair (é novidade na cidade, cliente vai se divertir)
- Usa gírias BR: "opa", "beleza", "fechou", "mandou bem", "boa pedida", "show", "tranquilo", "diacho", "uai" (uma ou outra, sem exagerar)
- Chama o cliente de "meu amigo", "meu chapa", "querido(a)" quando não sabe o nome
- Frases CURTAS. No máximo 15 palavras por resposta. Falamos por VOZ, não texto.
- Chama pelo nome sempre que souber
- Se cliente pedir algo que não tem, brinca: "opa, isso é lá no Mc, aqui é churrasqueiro!"

FLUXO NATURAL:
1. Se ESTADO ATUAL mostra "Cliente: (ainda não sei o nome)": PERGUNTE simpático "E aí, como é seu nome?"
2. Se ESTADO ATUAL mostra "Cliente: [algum nome]": JÁ SABE O NOME! NÃO pergunte nome de novo. Chame o cliente pelo nome direto.
3. Quando cliente disser o nome, use set_name e responda "opa, prazer [nome]! O que vai ser hoje?"
3. Ao adicionar item, seja natural: "Show, anotei!", "Fechado!", "Mandou bem, adicionei"
4. Se cliente disser "só isso", "é isso", "pode ir", "manda ver", "fecha aí", "tá bom":
   - Se carrinho VAZIO: brinca "Ué, ainda não pediu nada! O que vai querer?"
   - Se tem itens: RESUMA rapidinho ("Então é 2 frango, 1 cerveja. Fecho?") e chame set_confirming
5. Se cliente já estava confirmando E disser QUALQUER SIM (sim, isso mesmo, aham, tranquilo, fechou, pode, manda, beleza): chame confirm_order
6. Se cliente disser "espera", "muda", "quero mais", "adiciona" durante confirmação: cancel_confirming e escuta o que ele quer

REGRAS CRÍTICAS DE CARRINHO (NUNCA QUEBRE):
- NUNCA invente itens fora do MENU
- Use item_id EXATO
- SÓ CHAME add_item pros itens que o CLIENTE MENCIONOU NESTA MENSAGEM. NÃO re-adicione itens que já estão no carrinho.
- NUNCA chame clear_cart automaticamente. SÓ chame se cliente disser EXPLICITAMENTE: "cancela tudo", "esquece tudo", "começa de novo", "limpa o pedido". "Não vou beber" ou "não quero cerveja" NÃO é comando pra limpar carrinho, é só recusa de sugestão.
- NUNCA chame remove_item sem cliente pedir EXPLICITAMENTE ("tira o X", "remove o X", "não quero mais o X").
- Se cliente REJEITAR uma sugestão sua ("hoje não bebo", "não quero X"), apenas NÃO adicione essa sugestão. NÃO mexa em outros itens do carrinho.
- NUNCA diga "pedido confirmado" antes de chamar confirm_order de verdade

REGRAS DE INTERAÇÃO:
- Se cliente perguntar recomendação, sugira o carro-chefe (espetinhos) + cerveja
- Se cliente pedir CARDÁPIO / "o que vocês têm" / "quais as opções": CHAME show_menu() e diga curto "Tá aqui na tela, é só falar!". A tela mostra o cardápio pra ele ver.
- Se cliente for VAGO ("quero um lanche", "quero comer algo", "tô com fome"): sugira 2-3 opções da categoria pra ele escolher. Ex: "Boa! Temos X-Burger doze reais, X-Frango vinte e cinco, ou X-Tudo trinta e dois. Qual bate?"
- Se pedir só "espetinho" sem especificar: pergunta qual: "Show! Temos de alcatra, filé mignon, frango, coração, kafta. Qual vai?"
- Se pedir "bebida" sem especificar: "Beleza! Cerveja gelada, chopp, refri ou suco natural?"
- Se cliente perguntar preço: fale valor por extenso ("doze reais").
- Varie suas respostas ao adicionar: "Show!", "Anotado!", "Mandou bem!", "Fechado!", "Boa pedida!"
- Seja NATURAL, gente boa, brincalhona. Não seja robótica. Trate cada cliente como se fosse um amigo do bar.

REGRAS DE FALA:
- FALA NATURAL: nunca use símbolos ("×", "x", "c/", "s/", "R$", "#"). Escreva por extenso.
- Concordância PT-BR: sempre respeite gênero e plural! "UMA cerveja gelada" (fem), "UM chopp gelado" (masc), "DOIS espetinhos" (plural masc), "DUAS kaftas" (plural fem). NUNCA "uma chopp" ou "uma hamburger".
- Seu nome é GABI. NUNCA chame o CLIENTE de "Gabi". Se por algum motivo cliente parecer se apresentar como "Gabi", peça outro nome com humor: "Ê chapa, Gabi sou eu! Como é o seu?"

CROSS-SELL INTELIGENTE (aumenta ticket médio):
- Depois que cliente pedir 1-2 espetinhos e ainda não tem bebida: sugira "quer uma cervejinha gelada pra acompanhar?"
- Depois que cliente tiver bebida mas sem acompanhamento e >20 reais: sugira "vai um pão de alho ou farofa também?"
- Se cliente pedir bebida e não tem espetinho: sugira "e um espetinho pra petiscar? o de alcatra tá saindo muito!"
- Só sugira uma coisa por vez. Se cliente disser "só isso" ou recusar = respeita.

MENU (não invente, use item_id exato):
{menu}
"""


def _build_menu_text():
    return "\n".join([f"- {m['id']}: {m['name']} — R$ {m['price']:.2f} ({m['category']})" for m in MENU])


def _cart_summary(cart: list) -> str:
    """Human-friendly summary with correct gender/plural for spoken output."""
    if not cart:
        return "vazio"
    parts = []
    for c in cart:
        qty = c["qty"]
        gender = c.get("gender", "m")
        singular_name = c["name"]
        plural_name = c.get("plural", singular_name + "s")
        q_word = qty_word(qty, gender)
        name = singular_name if qty == 1 else plural_name
        parts.append(f"{q_word} {name}")
    # Join with commas but final "e"
    if len(parts) > 1:
        return ", ".join(parts[:-1]) + " e " + parts[-1]
    return parts[0]


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not OPENAI_API_KEY:
        return {"reply": "Desculpa, minha IA tá offline agora.", "cart": [], "phase": "error"}

    sess = _get_session(req.session_id)
    # Safety: don't accept blocked names from client
    if req.customer and not sess["customer"]:
        if req.customer.strip().lower() not in BLOCKED_NAMES:
            sess["customer"] = req.customer

    # If we already know the customer (face recognized), skip greeting phase
    if sess["customer"] and sess["phase"] == "greeting":
        sess["phase"] = "ordering"
        print(f"   🎯 Cliente já conhecido ({sess['customer']}), pulando greeting → ordering")

    # Seed assistant history when customer known but history empty, so GPT doesn't ask name
    if sess["customer"] and not sess["history"]:
        sess["history"].append({
            "role": "assistant",
            "content": f"Ê {sess['customer']}, boas! Tá de volta! O que vai ser hoje?"
        })
        print(f"   🌱 Seeded greeting for known customer")

    print(f"\n💬 [{req.session_id[:8]}] {sess['customer'] or '(anon)'} phase={sess['phase']}")
    print(f"   USER: {req.text!r}")
    print(f"   CART BEFORE: {[(c['qty'], c['name']) for c in sess['cart']]}")

    # Backend anti-echo: ignora se o texto contém frases típicas da Gabi
    ECHO_PATTERNS = [
        "não peguei", "nao peguei", "meu amigo", "meu chapa",
        "falou", "tô aqui", "to aqui", "se precisar",
        "jm espetinhos", "sou a gabi", "sou gabi",
        "como é seu nome", "como e seu nome",
        "o que vai ser hoje", "obrigada", "obrigado",
        "mandei pra cozinha", "mandou bem", "boa pedida",
        "quer uma cervejinha", "cliente chegou",
    ]
    if req.text and any(p in req.text.lower() for p in ECHO_PATTERNS):
        # Não é um input real do cliente — é eco da Gabi. Não muda estado.
        print(f"   🔕 ECHO IGNORED")
        return {
            "reply": "",  # not spoken
            "cart": sess["cart"],
            "phase": sess["phase"],
            "customer": sess["customer"],
            "actions": [],
            "mentioned": sess.get("last_mentioned", []),
            "confirmed_order": None,
            "echo_ignored": True,
        }


    # ── Heuristic pre-processing (guardrails) ──
    text_low = req.text.lower().strip()

    # Cliente pede pra ATUALIZAR / CORRIGIR o nome — libera pra ele falar de novo
    if sess["customer"] and re.search(
        r"(atualiz|corrig|troca|muda|alter|não\s+é\s+esse|nao\s+e\s+esse|meu\s+nome\s+não|meu\s+nome\s+nao|nome\s+errado)",
        text_low
    ):
        old = sess["customer"]
        sess["customer"] = None
        sess["phase"] = "greeting"
        reply = f"Ih, foi mal! Como é seu nome de verdade então?"
        sess["history"].append({"role": "user", "content": req.text})
        sess["history"].append({"role": "assistant", "content": reply})
        print(f"   🔄 Cliente pediu pra trocar nome ({old} → ?)")
        return {
            "reply": reply, "cart": sess["cart"], "phase": sess["phase"],
            "customer": None, "actions": [{"type": "reset_customer"}],
            "mentioned": sess.get("last_mentioned", []), "confirmed_order": None,
        }

    # Anti-Gabi: short-circuit se cliente tentar dizer que se chama Gabi/Gaby
    if not sess["customer"]:
        gabi_selfname_patterns = [
            r"meu\s+nome\s+é\s+gab[iy]",
            r"me\s+chamo\s+gab[iy]",
            r"(eu\s+)?sou\s+(?:o\s+|a\s+)?gab[iy]",
            r"pode\s+me\s+chamar\s+de\s+gab[iy]",
        ]
        for pat in gabi_selfname_patterns:
            if re.search(pat, text_low):
                reply = "Ê chapa, Gabi sou eu! Como é o seu nome de verdade?"
                sess["history"].append({"role": "user", "content": req.text})
                sess["history"].append({"role": "assistant", "content": reply})
                print(f"   🚫 ANTI-GABI: bloqueou tentativa de nome '{req.text!r}'")
                return {
                    "reply": reply, "cart": sess["cart"], "phase": sess["phase"],
                    "customer": None, "actions": [], "mentioned": sess.get("last_mentioned", []),
                    "confirmed_order": None,
                }

    # "só isso" / "é isso" — vai pra confirming (Gabi resume)
    CONFIRM_TRIGGERS = [
        "só isso", "so isso", "é isso", "e isso", "só", "tá bom", "ta bom",
        "acabou", "chega", "pronto", "encerrar"
    ]
    # Direct confirm — pula confirming e vai direto pra done (cliente já decidido)
    DIRECT_CONFIRM = [
        "pode mandar", "manda ver", "manda pra cozinha", "manda pra cozinh",
        "pode fechar", "fecha aí", "fecha ai", "finaliza", "finalizar", "pode ir",
        "manda o pedido", "envia", "manda logo",
        "fechou", "fechado", "confirmado", "confirma pedido", "envia pedido",
        "manda", "pode ir mandar", "manda a comida",
    ]
    YES_TRIGGERS = [
        "sim", "isso", "isso mesmo", "confirmo", "confirmado", "confirma",
        "pode", "pode sim", "pode mandar", "beleza", "fechou", "ok", "aham",
        "uhum", "correto", "positivo", "manda", "tranquilo", "certo", "boa",
        "é isso mesmo", "e isso mesmo", "isso ai", "isso aí", "fecha",
        "vai", "vai sim", "manda ver", "por favor", "obrigado", "obrigada",
        "só isso mesmo", "so isso mesmo", "eh", "é", "é isso", "e isso",
        "manda aí", "manda ai", "fecha aí", "fecha ai", "pode fechar",
        "tá bom", "ta bom", "tá ótimo", "ta otimo", "perfeito",
    ]
    NO_TRIGGERS = [
        "não", "nao", "espera", "espera aí", "espera ai", "peraí", "perai",
        "muda", "mudar", "quero mais", "adiciona", "tira", "remove", "cancela",
        "esquece", "errou",
    ]
    # Menu request triggers
    MENU_TRIGGERS = [
        "cardápio", "cardapio", "menu", "quais são as opções", "quais as opções",
        "quais sao as opcoes", "quais as opcoes", "o que vocês têm", "o que voces tem",
        "o que tem", "que opções", "quais opções", "quais opcoes",
        "me mostra", "mostra as opções", "mostra o cardapio", "mostra o cardápio",
    ]
    force_show_menu = any(t in text_low for t in MENU_TRIGGERS)
    # Pronomes / referências a algo que Gabi acabou de mencionar
    PRONOUN_TRIGGERS = [
        "pode ser esse", "pode ser esses", "pode ser essa", "pode ser essas",
        "quero esse", "quero esses", "quero essa", "quero essas",
        "manda esse", "manda esses", "manda essa", "manda essas",
        "esse mesmo", "essa mesma", "esses mesmos", "essas mesmas",
        "esse aí", "esse ai", "essa aí", "essa ai",
        "vai esse", "vai essa", "vai esses", "vai essas",
        "esse", "essa", "aquele", "aquela",
        "isso mesmo", "isso aí", "isso ai",
        "essa é boa", "esse é bom",
        "tá bom esse", "ta bom esse", "tá bom essa", "ta bom essa",
        # Respostas curtas de aceite a sugestão (Gabi ofereceu → cliente aceita)
        "pode ser", "pode ser sim", "beleza pode ser", "ok pode ser",
        "manda sim", "manda uma", "manda um", "manda dois", "manda duas",
        "traz um", "traz uma", "traz sim",
        "quero sim", "vai sim", "aceito", "topo", "topa",
        "boa ideia", "boa pedida",
    ]

    def _has_trigger(txt, triggers):
        return any(t in txt for t in triggers)

    # "Não" em ênfase (ex: "não, pode fechar") não é negação
    # Se após "não" aparece um YES trigger, é ênfase
    def _has_no_trigger(txt):
        if not any(n in txt for n in NO_TRIGGERS):
            return False
        # Se também tem um YES ou DIRECT_CONFIRM logo depois, é ênfase
        for yes in DIRECT_CONFIRM + YES_TRIGGERS:
            if yes in txt and yes not in NO_TRIGGERS:
                # Confere se o YES vem depois do "não"
                for no in NO_TRIGGERS:
                    idx_no = txt.find(no)
                    idx_yes = txt.find(yes)
                    if idx_no >= 0 and idx_yes > idx_no:
                        return False  # é ênfase
        return True

    forced_phase_change = None
    forced_confirm = False
    forced_name = None

    # Extract name if user says "meu nome é X" / "eu sou X" / "sou o X" / "me chamo X"
    if not sess["customer"]:
        name_patterns = [
            r"meu\s+nome\s+é\s+([a-zà-ú]+)",
            r"me\s+chamo\s+([a-zà-ú]+)",
            r"eu\s+sou\s+(?:o\s+|a\s+)?([a-zà-ú]+)",
            r"sou\s+(?:o\s+|a\s+)([a-zà-ú]+)",
            r"pode\s+me\s+chamar\s+de\s+([a-zà-ú]+)",
        ]
        for pat in name_patterns:
            m = re.search(pat, text_low)
            if m:
                raw_candidate = m.group(1).strip().lower()
                # Bloqueia falsos positivos e nome da atendente
                if raw_candidate in BLOCKED_NAMES:
                    continue
                candidate = normalize_name(raw_candidate)
                if candidate and candidate.lower() not in ["um", "uma", "o", "a", "de", "com", "que", "aqui", "bem"]:
                    forced_name = candidate
                    break
        # Fallback: single-word input (short) — treat as name if in greeting phase
        if not forced_name and sess["phase"] == "greeting":
            words = text_low.split()
            if len(words) == 1 and words[0].isalpha() and len(words[0]) >= 3 and words[0] not in BLOCKED_NAMES:
                forced_name = normalize_name(words[0])

    # Pronoun resolution: "pode ser esse" / "quero esse" → add last mentioned items
    # Só faz sentido em phase=ordering. Em "confirming", "pode ser" = confirmação do pedido.
    forced_add_from_mention = []
    if sess["phase"] == "ordering" and sess.get("last_mentioned") and _has_trigger(text_low, PRONOUN_TRIGGERS) and not _has_no_trigger(text_low):
        # Add only the FIRST mentioned item (or all if plural pronoun)
        plural = any(p in text_low for p in ["esses", "essas", "esses mesmos", "essas mesmas"])
        if plural:
            forced_add_from_mention = list(sess["last_mentioned"])
        else:
            forced_add_from_mention = [sess["last_mentioned"][0]]

    if sess["cart"]:
        # Direct confirmation (skip confirming step)
        if _has_trigger(text_low, DIRECT_CONFIRM) and not _has_no_trigger(text_low):
            forced_confirm = True
            sess["phase"] = "confirming"
        elif sess["phase"] == "ordering" and _has_trigger(text_low, CONFIRM_TRIGGERS) and not any(t in text_low for t in ["mais", "outro", "outra", "também", "tambem"]):
            forced_phase_change = "confirming"
        elif sess["phase"] == "confirming" and _has_trigger(text_low, YES_TRIGGERS) and not _has_no_trigger(text_low) and not forced_add_from_mention:
            forced_confirm = True
        elif sess["phase"] == "confirming" and _has_no_trigger(text_low):
            forced_phase_change = "ordering"

    try:
        import openai
        client = openai.OpenAI(api_key=OPENAI_API_KEY)

        # Build system with current state
        customer_txt = sess["customer"] or "(ainda não sei o nome)"
        cart_txt = _cart_summary(sess["cart"])
        phase = sess["phase"]

        history_hint = ""
        if sess["customer"] and sess["customer"] in customers:
            hist = customers[sess["customer"]].get("history", [])[:3]
            if hist:
                past = "; ".join([", ".join(h.get("items", [])) for h in hist])
                history_hint = f"\nHISTÓRICO PASSADO: já pediu antes: {past}"

        last_mentioned_txt = ""
        if sess.get("last_mentioned"):
            names = [_menu_by_id(iid)["name"] for iid in sess["last_mentioned"] if _menu_by_id(iid)]
            if names:
                last_mentioned_txt = f"\nVOCÊ acabou de mencionar/recomendar: {', '.join(names)}. Se o cliente disser 'esse'/'aquele'/'pode ser esse', se refere a esses itens."

        system = SYSTEM_PROMPT.format(menu=_build_menu_text()) + \
                 f"\n\nESTADO ATUAL:\nCliente: {customer_txt}\nCarrinho: {cart_txt}\nFase: {phase}" + last_mentioned_txt + history_hint

        tools = [
            {"type": "function", "function": {
                "name": "add_item",
                "description": "Adiciona item ao carrinho. Use quando o cliente pedir explicitamente um item do menu.",
                "parameters": {"type": "object", "properties": {
                    "item_id": {"type": "string", "description": "ID exato do menu (ex: esp-frango, cerveja)"},
                    "qty": {"type": "integer", "default": 1}
                }, "required": ["item_id"]}
            }},
            {"type": "function", "function": {
                "name": "remove_item",
                "description": "Remove ou reduz quantidade de um item do carrinho",
                "parameters": {"type": "object", "properties": {
                    "item_id": {"type": "string"},
                    "qty": {"type": "integer", "default": 1}
                }, "required": ["item_id"]}
            }},
            {"type": "function", "function": {
                "name": "set_name",
                "description": "Salva o nome do cliente quando ele se apresenta",
                "parameters": {"type": "object", "properties": {
                    "name": {"type": "string"}
                }, "required": ["name"]}
            }},
            {"type": "function", "function": {
                "name": "set_confirming",
                "description": "Marca fase de confirmação (só quando carrinho tem itens e cliente diz que é só isso)",
                "parameters": {"type": "object", "properties": {}}
            }},
            {"type": "function", "function": {
                "name": "cancel_confirming",
                "description": "Volta pra ordering se cliente quer mudar algo",
                "parameters": {"type": "object", "properties": {}}
            }},
            {"type": "function", "function": {
                "name": "confirm_order",
                "description": "Envia pedido pra cozinha DEFINITIVAMENTE. Só use quando fase = confirming e cliente disse sim.",
                "parameters": {"type": "object", "properties": {}}
            }},
            {"type": "function", "function": {
                "name": "clear_cart",
                "description": "Limpa o carrinho",
                "parameters": {"type": "object", "properties": {}}
            }},
            {"type": "function", "function": {
                "name": "show_menu",
                "description": "Abre o cardápio visualmente na tela quando cliente pede pra ver, quer opções ou pergunta 'o que vocês têm'. USE SEMPRE que cliente perguntar sobre cardápio/menu/opções.",
                "parameters": {"type": "object", "properties": {
                    "category": {"type": "string", "description": "Categoria específica pra destacar (Espetinhos, Lanches, Bebidas, Acompanhamentos). Deixe vazio pra mostrar tudo."}
                }}
            }},
        ]

        # Build messages: system + last 1 exchange for context (to avoid re-adding items)
        messages = [{"role": "system", "content": system}]
        # Only include the immediately previous assistant reply so GPT knows continuity
        if sess["history"]:
            last_assistant = None
            for h in reversed(sess["history"]):
                if h["role"] == "assistant":
                    last_assistant = h
                    break
            if last_assistant:
                messages.append({"role": "assistant", "content": last_assistant["content"]})
        messages.append({"role": "user", "content": req.text})

        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=tools,
            tool_choice="auto",
            temperature=0.5,
            max_tokens=180,
        )

        msg = resp.choices[0].message
        applied_actions = []
        confirmed = False

        if msg.tool_calls:
            for tc in msg.tool_calls:
                fname = tc.function.name
                fargs = json.loads(tc.function.arguments or "{}")
                if fname == "add_item":
                    m = _menu_by_id(fargs.get("item_id", ""))
                    if not m:
                        continue
                    qty = int(fargs.get("qty", 1))
                    ex = next((c for c in sess["cart"] if c["id"] == m["id"]), None)
                    if ex:
                        ex["qty"] += qty
                    else:
                        sess["cart"].append({**m, "qty": qty})
                    sess["phase"] = "ordering"
                    applied_actions.append({"type": "add", "item_id": m["id"], "qty": qty})
                elif fname == "remove_item":
                    item_id = fargs.get("item_id")
                    qty = int(fargs.get("qty", 1))
                    for c in sess["cart"]:
                        if c["id"] == item_id:
                            c["qty"] -= qty
                    sess["cart"] = [c for c in sess["cart"] if c["qty"] > 0]
                    applied_actions.append({"type": "remove", "item_id": item_id})
                elif fname == "set_name":
                    raw = fargs.get("name") or ""
                    if raw.strip().lower() in BLOCKED_NAMES:
                        # Cliente tentou usar nome da atendente
                        applied_actions.append({"type": "blocked_name", "raw": raw})
                    else:
                        name = normalize_name(raw)
                        if name:
                            sess["customer"] = name
                            if sess["phase"] == "greeting":
                                sess["phase"] = "ordering"
                            applied_actions.append({"type": "set_name", "name": name})
                elif fname == "set_confirming":
                    if sess["cart"]:
                        sess["phase"] = "confirming"
                        applied_actions.append({"type": "phase", "phase": "confirming"})
                elif fname == "cancel_confirming":
                    sess["phase"] = "ordering"
                    applied_actions.append({"type": "phase", "phase": "ordering"})
                elif fname == "confirm_order":
                    if sess["cart"] and sess["phase"] == "confirming":
                        # Actually save order
                        items = [{"id": c["id"], "name": c["name"], "qty": c["qty"], "price": c["price"], "total": c["price"] * c["qty"]} for c in sess["cart"]]
                        total = sum(i["total"] for i in items)
                        order = {
                            "id": str(uuid.uuid4())[:8],
                            "customer_id": sess["customer"] or "anonimo",
                            "items": items,
                            "total": total,
                            "notes": "",
                            "status": "preparing",
                            "created_at": datetime.now().isoformat(),
                        }
                        orders.append(order)
                        save_orders()
                        decrement_inventory(items)
                        await broadcast_inventory_alerts(items)
                        if sess["customer"] and sess["customer"] in customers:
                            names = [it["name"] for it in items]
                            customers[sess["customer"]]["history"].insert(0, {"items": names, "total": total, "date": order["created_at"]})
                            customers[sess["customer"]]["history"] = customers[sess["customer"]]["history"][:20]
                            save_customers()
                        sess["phase"] = "done"
                        confirmed = True
                        applied_actions.append({"type": "order_confirmed", "order": order})
                        await broadcast_new_order(order)
                elif fname == "clear_cart":
                    sess["cart"] = []
                    sess["phase"] = "ordering"
                    applied_actions.append({"type": "clear"})
                elif fname == "show_menu":
                    cat = fargs.get("category") or ""
                    applied_actions.append({"type": "show_menu", "category": cat})

        reply = (msg.content or "").strip()

        # ── Fix GPT that FORGETS to add items it mentions ──
        # Se cliente disse "acrescenta X" / "adiciona X" / "coloca X" / "quero X também",
        # e GPT não chamou add_item, forçar
        add_intent = any(t in text_low for t in [
            "acrescenta", "acrescente", "adiciona", "adicione",
            "coloca", "coloque", "põe", "poe",
            "quero também", "quero tambem", "quero mais", "e um", "e uma",
        ])
        if add_intent:
            wanted_ids = _extract_mentioned_items(req.text)
            cart_ids = {c["id"] for c in sess["cart"]}
            for iid in wanted_ids:
                if iid in cart_ids:
                    continue
                if any(a.get("type") == "add" and a.get("item_id") == iid for a in applied_actions):
                    continue
                m = _menu_by_id(iid)
                if m:
                    print(f"   🩹 FORCE-ADD (GPT forgot): {m['name']}")
                    sess["cart"].append({**m, "qty": 1})
                    sess["phase"] = "ordering"
                    applied_actions.append({"type": "add", "item_id": m["id"], "qty": 1})

        # ── Force show_menu if regex matched (or GPT called it) ──
        if force_show_menu and not any(a["type"] == "show_menu" for a in applied_actions):
            applied_actions.append({"type": "show_menu", "category": ""})
        # If show_menu was set (either way) and reply is generic, use warm response
        if any(a["type"] == "show_menu" for a in applied_actions):
            low = (reply or "").lower().strip().rstrip(".!?")
            generic = not reply or low in ["beleza", "ok", "certo", "show", "tranquilo", "claro"]
            if generic:
                warm_options = [
                    "Tá aqui na tela! É só falar o que vai querer.",
                    "Pronto, tá aí o cardápio. Fala o que bate a vontade!",
                    "Olha aí! Qualquer coisa é só me dizer.",
                ]
                import random as _r
                reply = _r.choice(warm_options)

        # ── Apply forced items from pronoun resolution ──
        if forced_add_from_mention and not any(a["type"] == "add" for a in applied_actions):
            added_names = []
            for iid in forced_add_from_mention:
                m = _menu_by_id(iid)
                if not m:
                    continue
                ex = next((c for c in sess["cart"] if c["id"] == m["id"]), None)
                if ex:
                    ex["qty"] += 1
                else:
                    sess["cart"].append({**m, "qty": 1})
                sess["phase"] = "ordering"
                added_names.append(m["name"])
                applied_actions.append({"type": "add", "item_id": m["id"], "qty": 1})
            if added_names and (not reply or reply.lower() in ["beleza.", "beleza", "ok"]):
                reply = f"Show, adicionei {added_names[0]}! Mais alguma coisa?"

        # ── Apply forced name (heuristic) if GPT didn't catch it ──
        if forced_name and not sess["customer"]:
            sess["customer"] = forced_name
            sess["phase"] = "ordering"
            applied_actions.append({"type": "set_name", "name": forced_name})

        # If we just learned a name (either via GPT or heuristic) and reply is generic, warm it up
        just_learned_name = any(a["type"] == "set_name" for a in applied_actions)
        if just_learned_name:
            name = sess["customer"]
            generic = not reply or reply.lower().rstrip(".") in ["beleza", "ok", "certo", "pode falar", "show", "tranquilo"]
            if generic and name:
                reply = f"Opa, prazer {name}! O que vai ser hoje, meu amigo?"

        # If GPT tried blocked name (Gabi), respond with humor and ask again
        if any(a["type"] == "blocked_name" for a in applied_actions) and not sess["customer"]:
            reply = "Ê chapa, Gabi sou eu! Como é o seu nome mesmo?"

        # ── Apply forced state changes from heuristics ──
        if forced_phase_change == "confirming" and sess["phase"] != "confirming" and sess["cart"]:
            sess["phase"] = "confirming"
            applied_actions.append({"type": "phase", "phase": "confirming"})
            # Override reply to standard confirmation
            reply = f"Então é {_cart_summary(sess['cart'])}. Confirma?"
        elif forced_phase_change == "ordering" and sess["phase"] == "confirming":
            sess["phase"] = "ordering"
            applied_actions.append({"type": "phase", "phase": "ordering"})
        elif forced_confirm and sess["cart"] and sess["phase"] == "confirming" and not confirmed:
            # Manually confirm the order
            items = [{"id": c["id"], "name": c["name"], "qty": c["qty"], "price": c["price"], "total": c["price"] * c["qty"]} for c in sess["cart"]]
            total = sum(i["total"] for i in items)
            order = {
                "id": str(uuid.uuid4())[:8],
                "customer_id": sess["customer"] or "anonimo",
                "items": items,
                "total": total,
                "notes": "",
                "status": "preparing",
                "created_at": datetime.now().isoformat(),
            }
            orders.append(order)
            save_orders()
            decrement_inventory(items)
            await broadcast_inventory_alerts(items)
            if sess["customer"] and sess["customer"] in customers:
                names = [it["name"] for it in items]
                customers[sess["customer"]]["history"].insert(0, {"items": names, "total": total, "date": order["created_at"]})
                customers[sess["customer"]]["history"] = customers[sess["customer"]]["history"][:20]
                save_customers()
            sess["phase"] = "done"
            confirmed = True
            applied_actions.append({"type": "order_confirmed", "order": order})
            await broadcast_new_order(order)
            reply = f"Fechou! Já mandei pra cozinha. Sua senha é #{order['id']}. Obrigada!"

        # Sanity check: never say confirmed unless truly confirmed
        if not confirmed:
            lowered = reply.lower()
            for bad in ["seu pedido foi confirmado", "pedido confirmado", "enviado pra cozinha", "enviado para cozinha", "já mandei", "mandei pra cozinha"]:
                if bad in lowered:
                    # Rewrite
                    if sess["cart"] and sess["phase"] != "confirming":
                        reply = f"Deixa eu confirmar: {_cart_summary(sess['cart'])}. Fecho o pedido?"
                        sess["phase"] = "confirming"
                        applied_actions.append({"type": "phase", "phase": "confirming"})
                    break

        # Fallback replies (variadas pra não ficar robótico)
        import random
        if not reply:
            if confirmed:
                reply = random.choice([
                    "Fechou! Mandei pra cozinha. Obrigada!",
                    "Show! Já tá na chapa, valeu!",
                    "Beleza, tá indo! Aguenta aí que já sai!",
                ])
            elif applied_actions:
                if any(a["type"] == "add" for a in applied_actions):
                    reply = random.choice([
                        "Anotado! Mais alguma coisa?",
                        "Show! Vai querer mais alguma coisa?",
                        "Fechado, tá aqui! Mais algo?",
                        "Boa pedida! Mais alguma coisa?",
                        "Beleza, adicionei. Vai algo mais?",
                        "Mandou bem! Quer mais alguma?",
                    ])
                elif any(a["type"] == "phase" and a.get("phase") == "confirming" for a in applied_actions):
                    reply = f"Então é: {_cart_summary(sess['cart'])}. Fecho pra você?"
                else:
                    reply = "Beleza."
            else:
                reply = "Pode falar, meu amigo."

        # Update conversation history
        sess["history"].append({"role": "user", "content": req.text})
        sess["history"].append({"role": "assistant", "content": reply})

        # Track items Gabi mentioned in this reply (for pronoun resolution next turn)
        mentioned = _extract_mentioned_items(reply)
        # Exclude items already in cart (customer wouldn't say "esse" about something already ordered)
        cart_ids = {c["id"] for c in sess["cart"]}
        mentioned_new = [m for m in mentioned if m not in cart_ids]
        if mentioned_new:
            sess["last_mentioned"] = mentioned_new

        print(f"   GABI: {reply!r}")
        print(f"   CART AFTER: {[(c['qty'], c['name']) for c in sess['cart']]}")
        print(f"   ACTIONS: {applied_actions}")

        return {
            "reply": reply,
            "cart": sess["cart"],
            "phase": sess["phase"],
            "customer": sess["customer"],
            "actions": applied_actions,
            "mentioned": sess.get("last_mentioned", []),
            "confirmed_order": applied_actions[-1].get("order") if confirmed else None,
        }
    except Exception as e:
        import traceback; traceback.print_exc()
        print(f"Chat error: {e}")
        return {"reply": "Ops, tive um probleminha. Pode repetir?", "cart": sess["cart"], "phase": sess["phase"]}


@app.post("/api/session/reset")
async def reset_session(payload: dict):
    sid = payload.get("session_id")
    if sid in sessions:
        del sessions[sid]
    return {"ok": True}


# ============ HeyGen Streaming Avatar (proxy que esconde a API key) ============
import urllib.request as _urlreq
import urllib.error as _urlerr

@app.post("/api/heygen/token")
async def heygen_token():
    """Cria access token de sessão do HeyGen (curta duração). Frontend usa esse
    token pra abrir a sessão de streaming. API key nunca sai do backend."""
    api_key = os.getenv("HEYGEN_API_KEY", "").strip()
    if not api_key:
        return {"error": "HEYGEN_API_KEY não configurada no .env"}
    try:
        req = _urlreq.Request(
            "https://api.heygen.com/v1/streaming.create_token",
            method="POST",
            headers={"x-api-key": api_key, "Content-Type": "application/json"},
            data=b"{}",
        )
        with _urlreq.urlopen(req, timeout=15) as r:
            body = json.loads(r.read().decode())
        token = (body.get("data") or {}).get("token") or body.get("token")
        if not token:
            return {"error": "resposta sem token", "raw": body}
        return {"token": token}
    except _urlerr.HTTPError as e:
        return {"error": f"HTTP {e.code}", "detail": e.read().decode(errors='ignore')[:400]}
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/heygen/avatars")
async def heygen_avatars():
    """Lista avatares interativos disponíveis pra sessão de streaming."""
    api_key = os.getenv("HEYGEN_API_KEY", "").strip()
    if not api_key:
        return {"error": "HEYGEN_API_KEY não configurada"}
    try:
        req = _urlreq.Request(
            "https://api.heygen.com/v1/streaming/avatar.list",
            headers={"x-api-key": api_key},
        )
        with _urlreq.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        return {"error": str(e)}


# WebSocket for live processing
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            msg = await ws.receive_text()
            data = json.loads(msg)
            if data.get("type") == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
                continue
            if data.get("frame") and FACE_ENABLED:
                img = decode_frame(data["frame"])
                boxes, probs = face_detector.detect(img)
                if boxes is not None and len(boxes) > 0:
                    areas = [(b[2] - b[0]) * (b[3] - b[1]) for b in boxes]
                    idx = int(np.argmax(areas))
                    box = boxes[idx]
                    prob = float(probs[idx]) if probs is not None else 1.0
                    # Face size as % of frame (proxy for closeness / engagement)
                    frame_area = img.size[0] * img.size[1]
                    face_ratio = float(areas[idx] / frame_area) if frame_area else 0.0
                    embedding = get_face_embedding(img, box)
                    name, score = (None, 0.0) if embedding is None else recognize_face(embedding)
                    # Engagement heuristic: face large AND high probability
                    is_engaged = face_ratio > 0.05 and prob > 0.9
                    await ws.send_text(json.dumps({
                        "type": "face",
                        "detected": True,
                        "known": name is not None,
                        "name": name,
                        "confidence": round(score * 100, 1) if name else 0,
                        "bbox": box.tolist(),
                        "n_faces": len(boxes),
                        "face_ratio": round(face_ratio, 4),
                        "prob": round(prob, 3),
                        "engaged": is_engaged,
                    }))
                else:
                    await ws.send_text(json.dumps({"type": "face", "detected": False, "n_faces": 0, "engaged": False}))
    except WebSocketDisconnect:
        pass


# ══════════════════════════════════════════════════════════════════════════════
# iFood Merchant API integration
# ══════════════════════════════════════════════════════════════════════════════
import ifood_client as _ifood

# Background polling task handle
_ifood_poll_task: asyncio.Task | None = None


class IFoodCredentials(BaseModel):
    clientId: str
    clientSecret: str


class IFoodMerchantAction(BaseModel):
    merchantId: str
    minutes: int = 60  # used by pause


class IFoodCancelRequest(BaseModel):
    reasonCode: str
    reason: str = ""


@app.post("/api/ifood/configure")
async def ifood_configure(creds: IFoodCredentials):
    """Salvar clientId + clientSecret iFood e testar autenticação."""
    _ifood.save_credentials(creds.clientId, creds.clientSecret)
    try:
        token = _ifood.get_token(force_refresh=True)
        merchants = _ifood.list_merchants()
        return {"ok": True, "merchants": merchants, "message": f"Conectado! {len(merchants)} loja(s) encontrada(s)."}
    except Exception as e:
        return JSONResponse(status_code=400, content={"ok": False, "error": str(e)})


@app.get("/api/ifood/status")
async def ifood_status():
    """Retorna status da conexão iFood (token, lojas, polling)."""
    cfg = _ifood.get_config()
    has_creds = bool(cfg.get("clientId") and cfg.get("clientSecret"))
    if not has_creds:
        return {"connected": False, "message": "Credenciais não configuradas"}
    try:
        token = _ifood.get_token()
        merchants = _ifood.list_merchants() if token else []
        return {
            "connected": bool(token),
            "merchants": merchants,
            "polling_active": _ifood_poll_task is not None and not _ifood_poll_task.done(),
            "clientId": cfg.get("clientId", "")[:8] + "…",
        }
    except Exception as e:
        return {"connected": False, "error": str(e)}


@app.get("/api/ifood/merchants")
async def ifood_merchants():
    try:
        return _ifood.list_merchants()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/ifood/merchants/{merchant_id}/status")
async def ifood_merchant_status(merchant_id: str):
    try:
        return _ifood.get_merchant_status(merchant_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/ifood/merchants/{merchant_id}/open")
async def ifood_open_merchant(merchant_id: str):
    """Abrir restaurante no iFood (remove interrupções)."""
    try:
        return _ifood.open_merchant(merchant_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/ifood/merchants/{merchant_id}/pause")
async def ifood_pause_merchant(merchant_id: str, body: IFoodMerchantAction):
    """Pausar restaurante no iFood por N minutos."""
    try:
        return _ifood.pause_merchant(merchant_id, body.minutes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/ifood/events/poll")
async def ifood_poll():
    """Buscar novos eventos iFood e importar pedidos no sistema."""
    try:
        events = _ifood.poll_events()
        imported = []
        ack_ids = []

        for ev in events:
            eid = ev.get("id") or ev.get("eventId")
            ecode = ev.get("code") or ev.get("type", "")
            order_id = ev.get("orderId") or ev.get("reference")

            ack_ids.append(eid)

            if ecode == "PLACED" and order_id:
                # New order! Fetch details and import
                try:
                    ifood_order = _ifood.get_order(order_id)
                    internal = _ifood.ifood_order_to_internal(ifood_order)

                    # Avoid duplicate imports
                    if not any(o.get("ifood_id") == order_id for o in orders):
                        internal["status"] = "pending"
                        orders.append(internal)
                        save_orders()
                        imported.append(order_id)
                        # Auto-confirm on iFood
                        try:
                            _ifood.confirm_order(order_id)
                        except Exception:
                            pass
                except Exception as e:
                    pass  # log but don't fail the whole poll

        if ack_ids:
            _ifood.acknowledge_events(ack_ids)

        return {"ok": True, "events": len(events), "imported": imported}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/ifood/orders")
async def ifood_orders():
    """Listar todos os pedidos vindos do iFood."""
    ifood = [o for o in orders if o.get("source") == "ifood" or o.get("channel") == "ifood"]
    return {"orders": ifood, "total": len(ifood)}


@app.post("/api/ifood/orders/{order_id}/confirm")
async def ifood_confirm(order_id: str):
    try:
        _ifood.confirm_order(order_id)
        # Update local status too
        for o in orders:
            if o.get("ifood_id") == order_id:
                o["status"] = "confirmed"
        save_orders()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/ifood/orders/{order_id}/start-preparation")
async def ifood_start_prep(order_id: str):
    try:
        _ifood.start_preparation(order_id)
        for o in orders:
            if o.get("ifood_id") == order_id:
                o["status"] = "preparing"
        save_orders()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/ifood/orders/{order_id}/ready")
async def ifood_ready(order_id: str):
    try:
        _ifood.ready_to_pickup(order_id)
        for o in orders:
            if o.get("ifood_id") == order_id:
                o["status"] = "ready"
        save_orders()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/ifood/orders/{order_id}/dispatch")
async def ifood_dispatch(order_id: str):
    try:
        _ifood.dispatch_order(order_id)
        for o in orders:
            if o.get("ifood_id") == order_id:
                o["status"] = "dispatched"
        save_orders()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/ifood/orders/{order_id}/cancel")
async def ifood_cancel(order_id: str, body: IFoodCancelRequest):
    try:
        _ifood.cancel_order(order_id, body.reasonCode, body.reason)
        for o in orders:
            if o.get("ifood_id") == order_id:
                o["status"] = "cancelled"
        save_orders()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/ifood/orders/{order_id}/cancellation-reasons")
async def ifood_cancel_reasons(order_id: str):
    try:
        return _ifood.get_cancellation_reasons(order_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# Background polling loop
async def _ifood_background_poll(interval_seconds: int = 30):
    """Poll iFood every `interval_seconds` for new orders."""
    while True:
        try:
            cfg = _ifood.get_config()
            if cfg.get("clientId") and cfg.get("clientSecret"):
                events = _ifood.poll_events()
                ack_ids = []
                for ev in events:
                    eid = ev.get("id") or ev.get("eventId")
                    ecode = ev.get("code") or ev.get("type", "")
                    order_id = ev.get("orderId") or ev.get("reference")
                    if eid:
                        ack_ids.append(eid)
                    if ecode == "PLACED" and order_id:
                        try:
                            ifood_order = _ifood.get_order(order_id)
                            internal = _ifood.ifood_order_to_internal(ifood_order)
                            if not any(o.get("ifood_id") == order_id for o in orders):
                                orders.append(internal)
                                save_orders()
                                try:
                                    _ifood.confirm_order(order_id)
                                except Exception:
                                    pass
                        except Exception:
                            pass
                if ack_ids:
                    _ifood.acknowledge_events(ack_ids)
        except Exception:
            pass  # never crash the background task
        await asyncio.sleep(interval_seconds)


@app.on_event("startup")
async def start_ifood_polling():
    global _ifood_poll_task
    cfg = _ifood.get_config()
    if cfg.get("clientId") and cfg.get("clientSecret"):
        _ifood_poll_task = asyncio.create_task(_ifood_background_poll(30))


@app.post("/api/ifood/polling/start")
async def start_polling():
    global _ifood_poll_task
    if _ifood_poll_task and not _ifood_poll_task.done():
        return {"ok": True, "message": "Polling já ativo"}
    _ifood_poll_task = asyncio.create_task(_ifood_background_poll(30))
    return {"ok": True, "message": "Polling iniciado (a cada 30s)"}


@app.post("/api/ifood/polling/stop")
async def stop_polling():
    global _ifood_poll_task
    if _ifood_poll_task and not _ifood_poll_task.done():
        _ifood_poll_task.cancel()
    _ifood_poll_task = None
    return {"ok": True, "message": "Polling pausado"}


# ── Serve React SPA (built files) ────────────────────────────────────────────
_STATIC_DIR = BASE_DIR / "static"
if _STATIC_DIR.exists():
    for _sub in ["assets", "avatars", "jm", "videos"]:
        _d = _STATIC_DIR / _sub
        if _d.exists():
            app.mount(f"/{_sub}", StaticFiles(directory=str(_d)), name=_sub)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        """Serve index.html for all non-API routes (SPA client-side routing)."""
        return FileResponse(str(_STATIC_DIR / "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8011, reload=False)
