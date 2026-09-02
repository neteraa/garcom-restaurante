"""
iFood Merchant API client
Docs: https://developer.ifood.com.br/en-US/docs/references

Base URLs:
  auth   → https://merchant-api.ifood.com.br/authentication/v1.0
  merchant → https://merchant-api.ifood.com.br/merchant/v1.0
  order  → https://merchant-api.ifood.com.br/order/v1.0
"""

import json
import time
from pathlib import Path
from typing import Optional

import httpx

_BASE_AUTH = "https://merchant-api.ifood.com.br/authentication/v1.0"
_BASE_MERCHANT = "https://merchant-api.ifood.com.br/merchant/v1.0"
_BASE_ORDER = "https://merchant-api.ifood.com.br/order/v1.0"

_CONFIG_FILE = Path(__file__).parent / "data" / "ifood_config.json"


# ── Persistent config (clientId / clientSecret / token cache) ───────────────

def _load_config() -> dict:
    if _CONFIG_FILE.exists():
        with open(_CONFIG_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_config(cfg: dict) -> None:
    _CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def get_config() -> dict:
    return _load_config()


def save_credentials(client_id: str, client_secret: str) -> None:
    cfg = _load_config()
    cfg["clientId"] = client_id
    cfg["clientSecret"] = client_secret
    cfg.pop("accessToken", None)  # force re-auth
    cfg.pop("expiresAt", None)
    _save_config(cfg)


# ── Authentication ────────────────────────────────────────────────────────────

def get_token(force_refresh: bool = False) -> Optional[str]:
    """Return a valid access token, refreshing if expired."""
    cfg = _load_config()
    client_id = cfg.get("clientId")
    client_secret = cfg.get("clientSecret")
    if not client_id or not client_secret:
        return None

    # Use cached token if still valid (with 60s buffer)
    if not force_refresh:
        token = cfg.get("accessToken")
        expires_at = cfg.get("expiresAt", 0)
        if token and time.time() < expires_at - 60:
            return token

    resp = httpx.post(
        f"{_BASE_AUTH}/oauth/token",
        data={
            "grantType": "client_credentials",
            "clientId": client_id,
            "clientSecret": client_secret,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    token = data["accessToken"]
    cfg["accessToken"] = token
    cfg["expiresAt"] = time.time() + int(data.get("expiresIn", 3600))
    _save_config(cfg)
    return token


def _headers() -> dict:
    token = get_token()
    if not token:
        raise ValueError("iFood não configurado: defina clientId e clientSecret em /api/ifood/configure")
    return {"Authorization": f"Bearer {token}"}


# ── Merchant ──────────────────────────────────────────────────────────────────

def list_merchants() -> list:
    resp = httpx.get(f"{_BASE_MERCHANT}/merchants", headers=_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()


def get_merchant(merchant_id: str) -> dict:
    resp = httpx.get(f"{_BASE_MERCHANT}/merchants/{merchant_id}", headers=_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()


def get_merchant_status(merchant_id: str) -> dict:
    resp = httpx.get(f"{_BASE_MERCHANT}/merchants/{merchant_id}/status", headers=_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()


def open_merchant(merchant_id: str) -> dict:
    """Remove all interruptions to open the restaurant on iFood."""
    # Get current interruptions
    r = httpx.get(f"{_BASE_MERCHANT}/merchants/{merchant_id}/interruptions", headers=_headers(), timeout=15)
    r.raise_for_status()
    interruptions = r.json()
    removed = 0
    for item in interruptions:
        iid = item.get("id") or item.get("interruptionId")
        if iid:
            httpx.delete(
                f"{_BASE_MERCHANT}/merchants/{merchant_id}/interruptions/{iid}",
                headers=_headers(), timeout=15,
            )
            removed += 1
    return {"ok": True, "interruptionsRemoved": removed}


def pause_merchant(merchant_id: str, minutes: int = 60, reason: str = "OPERATIONAL") -> dict:
    """Pause the restaurant on iFood for `minutes` minutes."""
    from datetime import datetime, timedelta, timezone
    end = (datetime.now(timezone.utc) + timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%SZ")
    body = {"start": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "end": end, "reason": reason}
    r = httpx.post(
        f"{_BASE_MERCHANT}/merchants/{merchant_id}/interruptions",
        json=body, headers=_headers(), timeout=15,
    )
    r.raise_for_status()
    return r.json()


# ── Events polling ────────────────────────────────────────────────────────────

def poll_events() -> list:
    """Poll for new order events. Returns list of event dicts."""
    resp = httpx.get(f"{_BASE_ORDER}/events:polling", headers=_headers(), timeout=15)
    if resp.status_code == 204:
        return []  # no new events
    resp.raise_for_status()
    return resp.json() or []


def acknowledge_events(event_ids: list[str]) -> None:
    """Acknowledge processed events so they don't appear again."""
    if not event_ids:
        return
    body = [{"id": eid} for eid in event_ids]
    resp = httpx.post(
        f"{_BASE_ORDER}/events/acknowledgment",
        json=body, headers=_headers(), timeout=15,
    )
    resp.raise_for_status()


# ── Order details ─────────────────────────────────────────────────────────────

def get_order(order_id: str) -> dict:
    resp = httpx.get(f"{_BASE_ORDER}/orders/{order_id}", headers=_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()


# ── Order status actions ──────────────────────────────────────────────────────

def confirm_order(order_id: str) -> None:
    """Accept/confirm a new iFood order."""
    r = httpx.post(f"{_BASE_ORDER}/orders/{order_id}/statuses/confirmation", headers=_headers(), timeout=15)
    r.raise_for_status()


def start_preparation(order_id: str) -> None:
    r = httpx.post(f"{_BASE_ORDER}/orders/{order_id}/statuses/startPreparation", headers=_headers(), timeout=15)
    r.raise_for_status()


def ready_to_pickup(order_id: str) -> None:
    r = httpx.post(f"{_BASE_ORDER}/orders/{order_id}/statuses/readyToPickup", headers=_headers(), timeout=15)
    r.raise_for_status()


def dispatch_order(order_id: str) -> None:
    r = httpx.post(f"{_BASE_ORDER}/orders/{order_id}/dispatch", headers=_headers(), timeout=15)
    r.raise_for_status()


def cancel_order(order_id: str, reason_code: str, reason: str = "") -> None:
    body = {"cancellationCode": reason_code, "reason": reason}
    r = httpx.post(
        f"{_BASE_ORDER}/orders/{order_id}/requestCancellation",
        json=body, headers=_headers(), timeout=15,
    )
    r.raise_for_status()


def get_cancellation_reasons(order_id: str) -> list:
    r = httpx.get(f"{_BASE_ORDER}/orders/{order_id}/cancellationReasons", headers=_headers(), timeout=15)
    r.raise_for_status()
    return r.json()


# ── Helpers to map iFood order → our internal order format ───────────────────

def ifood_order_to_internal(ifood_order: dict) -> dict:
    """Convert an iFood order dict to our internal orders format."""
    import uuid
    from datetime import datetime

    items = []
    for item in ifood_order.get("items", []):
        items.append({
            "id": item.get("externalCode") or item.get("name", "")[:20],
            "name": item.get("name", ""),
            "quantity": item.get("quantity", 1),
            "price": item.get("unitPrice", {}).get("value", 0) if isinstance(item.get("unitPrice"), dict) else item.get("unitPrice", 0),
            "notes": "; ".join(
                [opt.get("name", "") for group in item.get("optionGroups", []) for opt in group.get("options", [])]
            ),
        })

    customer = ifood_order.get("customer", {})
    delivery = ifood_order.get("delivery", {})
    payment = ifood_order.get("payments", {})

    total = 0
    if isinstance(payment, dict):
        total = payment.get("totalOrderAmount", 0) or payment.get("subTotal", 0)
    elif isinstance(payment, list) and payment:
        total = sum(p.get("value", 0) for p in payment)

    address = delivery.get("deliveryAddress", {}) if isinstance(delivery, dict) else {}
    addr_str = ""
    if address:
        addr_str = f"{address.get('streetName', '')} {address.get('streetNumber', '')}, {address.get('neighborhood', '')} — {address.get('city', '')}"

    order_type = ifood_order.get("orderType", "DELIVERY")  # DELIVERY, TAKEOUT, INDOOR

    return {
        "id": str(uuid.uuid4())[:8].upper(),
        "ifood_id": ifood_order.get("id"),
        "source": "ifood",
        "customer": customer.get("name", "Cliente iFood"),
        "customer_phone": customer.get("phone", {}).get("number", "") if isinstance(customer.get("phone"), dict) else "",
        "items": items,
        "total": total,
        "status": "pending",
        "order_type": order_type,
        "delivery_address": addr_str,
        "notes": ifood_order.get("observations", ""),
        "created_at": ifood_order.get("createdAt") or datetime.now().isoformat(),
        "channel": "ifood",
    }
