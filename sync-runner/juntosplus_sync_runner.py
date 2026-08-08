#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RUNNER Juntos+ (Coca-Cola FEMSA) -> StockRápido.

Juntos+ requiere OTP y por eso el login es interactivo. El runner abre Chromium:
logueate, entrá al catálogo y volvé a la terminal para presionar Enter. Mientras
navegás captura el Bearer y el cid de las requests a api.juntosplus.com; nunca
imprime el token. Después descarga el catálogo completo, conserva cada card
original en `raw` y lo empuja a StockRápido.

Requisitos:
    python -m pip install playwright
    python -m playwright install chromium

Configuración en sync-runner/.env (sin credenciales hardcodeadas):
    SR_API=https://stockrapido-api.vercel.app
    SR_EMAIL=tu-email-stockrapido
    SR_PASSWORD=tu-password-stockrapido

Uso:
    python juntosplus_sync_runner.py
"""

import json
import os
import time
import urllib.error
import urllib.request
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright


def _load_dotenv():
    path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as env_file:
        for line in env_file:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()
SR_API = os.environ.get("SR_API", "https://stockrapido-api.vercel.app").rstrip("/")
SR_EMAIL = os.environ.get("SR_EMAIL", "")
SR_PASSWORD = os.environ.get("SR_PASSWORD", "")
LOGIN_URL = "https://ar.juntosplus.com/AR/login"
API_BASE = "https://api.juntosplus.com/v2/prd"
PAGE_SIZE = 100
PUSH_BATCH = 100

if not SR_EMAIL or not SR_PASSWORD:
    raise SystemExit(
        "Faltan SR_EMAIL/SR_PASSWORD. Copiá sync-runner/.env.example a .env y completalo."
    )


def _sr_json(path, token=None, method="GET", payload=None, timeout=60):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(
        SR_API + path, data=data, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"StockRápido respondió HTTP {error.code}: {detail}") from error


def sr_login():
    result = _sr_json(
        "/auth/login",
        method="POST",
        payload={"email": SR_EMAIL, "password": SR_PASSWORD},
    )
    token = result.get("accessToken")
    if not token:
        raise RuntimeError("StockRápido no devolvió accessToken.")
    return token


def sr_get_connection(token):
    connections = _sr_json("/sync/connections", token=token)
    for connection in connections:
        if connection.get("provider") == "juntosplus":
            return connection["id"]
    created = _sr_json(
        "/sync/connections",
        token=token,
        method="POST",
        payload={"provider": "juntosplus", "name": "Juntos+", "priceMarkup": 40},
    )
    return created["id"]


def sr_push(token, connection_id, items):
    return _sr_json(
        f"/sync/connections/{connection_id}/push",
        token=token,
        method="POST",
        payload={"items": items},
        timeout=180,
    )


def _number(value):
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            return float(value.replace(",", "."))
        except ValueError:
            return None
    return None


def _integer(value):
    number = _number(value)
    return int(number) if number is not None else None


def _boolean(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "si", "sí", "s", "yes"}:
            return True
        if normalized in {"false", "0", "no", "n"}:
            return False
    return None


def extract_cards(payload):
    """Encuentra products_card aun si Juntos+ cambia el nivel de anidación."""
    cards = []

    def walk(node):
        if isinstance(node, dict):
            product_cards = node.get("products_card")
            if isinstance(product_cards, list):
                cards.extend(card for card in product_cards if isinstance(card, dict))
            for value in node.values():
                if value is not product_cards:
                    walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(payload)
    return cards


def category_names(payload):
    names = set()

    def walk(node):
        if isinstance(node, dict):
            name = node.get("category_name")
            if isinstance(name, str) and name.strip():
                names.add(name.strip())
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(payload)
    return sorted(names)


def api_get(request_context, path, auth, cid, **params):
    query = {"platform": "Web", "lang": "esp", "cid": cid, **params}
    response = request_context.get(
        API_BASE + path,
        params=query,
        headers={"Authorization": auth, "Accept": "application/json"},
        timeout=60000,
    )
    if not response.ok:
        raise RuntimeError(f"Juntos+ {path} respondió HTTP {response.status}")
    return response.json()


def fetch_catalog(request_context, auth, cid):
    print("Descargando categorías…")
    categories_payload = api_get(
        request_context,
        "/categories/api/categories",
        auth,
        cid,
        offset=1,
        limit=9999,
    )
    collected = extract_cards(categories_payload)
    print(f"  cards encontradas en categorías: {len(collected)}")

    print("Paginando búsqueda general…")
    offset = 0
    search_had_cards = False
    while True:
        payload = api_get(
            request_context,
            "/products/api/search",
            auth,
            cid,
            offset=offset,
            limit=PAGE_SIZE,
            product="",
        )
        batch = extract_cards(payload)
        if batch:
            search_had_cards = True
            collected.extend(batch)
        total = _integer(payload.get("total")) if isinstance(payload, dict) else None
        print(f"  offset {offset}: {len(batch)} cards" + (f" / total {total}" if total is not None else ""))
        next_offset = offset + PAGE_SIZE
        if total is not None and next_offset >= total:
            break
        if not batch or (total is None and len(batch) < PAGE_SIZE):
            break
        offset = next_offset
        time.sleep(0.15)

    if not search_had_cards:
        names = category_names(categories_payload)
        print(f"La búsqueda general vino vacía; probando {len(names)} categorías…")
        for index, name in enumerate(names, 1):
            try:
                payload = api_get(
                    request_context,
                    "/products/api/search",
                    auth,
                    cid,
                    offset=0,
                    limit=9999,
                    product=name,
                )
                cards = extract_cards(payload)
                collected.extend(cards)
                print(f"  categoría {index}/{len(names)}: {name} ({len(cards)})")
            except Exception as error:
                print(f"  categoría {name}: error {str(error)[:100]}")
            time.sleep(0.1)

    unique = {}
    for card in collected:
        key = card.get("id") or card.get("sku")
        if key is not None:
            unique[str(key)] = card
    return list(unique.values())


def normalize(card):
    categories = card.get("categories") if isinstance(card.get("categories"), list) else []
    category = categories[0] if categories and isinstance(categories[0], dict) else {}
    subcategory = categories[1] if len(categories) > 1 and isinstance(categories[1], dict) else {}
    minimum = _integer(card.get("min_sale_quantity"))
    tax = _number(card.get("tax"))
    tax_rate = tax if tax is not None and 0 <= tax <= 100 else None
    base_price = _number(card.get("base_price"))
    selling_price = _number(card.get("price"))
    external_id = card.get("id") or card.get("sku")
    item = {
        "externalId": str(external_id),
        "sku": str(card["sku"]) if card.get("sku") is not None else None,
        "supplierRef": str(card["sku"]) if card.get("sku") is not None else None,
        "name": card.get("name") or f"Producto {external_id}",
        "cost": base_price,
        "basePrice": base_price,
        "listPrice": _number(card.get("price")) or _number(card.get("unit_price")),
        "ivaAlicuota": tax_rate,
        "category": category.get("category_name"),
        "subcategory": subcategory.get("category_name"),
        "brand": card.get("aggroupation_name"),
        "imageUrl": card.get("image"),
        "available": bool(card.get("available", True)),
        "stock": _integer(card.get("available_quantity")),
        "presentation": card.get("presentation"),
        "format": card.get("container_type"),
        "weight": str(card["measure"]) if card.get("measure") is not None else None,
        "unitsPerBox": str(minimum) if minimum is not None and minimum > 1 else None,
        "retornable": _boolean(card.get("retornable")),
        "variants": [{
            "uom": "UN",
            "multiplier": 1,
            "skuId": str(card["sku"]) if card.get("sku") is not None else None,
            "ean": None,
            "listPrice": selling_price,
            "sellingPrice": selling_price,
            "cost": base_price,
            "stock": _integer(card.get("available_quantity")),
            "taxAlicuota": tax_rate,
        }],
        "raw": card,
    }
    return {key: value for key, value in item.items() if value is not None}


def main():
    print("Iniciando sesión en StockRápido…")
    sr_token = sr_login()
    connection_id = sr_get_connection(sr_token)
    print(f"  conexión Juntos+: {connection_id}")

    captured = {"authorization": None, "cid": None}

    def capture_request(request):
        if "api.juntosplus.com" not in request.url:
            return
        authorization = request.headers.get("authorization")
        cid_values = parse_qs(urlparse(request.url).query).get("cid")
        if authorization and authorization.lower().startswith("bearer "):
            captured["authorization"] = authorization
        if cid_values and cid_values[0]:
            captured["cid"] = cid_values[0]

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.on("request", capture_request)
        print("Abriendo Juntos+…")
        page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=90000)
        while not captured["authorization"] or not captured["cid"]:
            input("Logueate y entrá al catálogo; presioná Enter cuando estés dentro: ")
            page.wait_for_timeout(1500)
            if not captured["authorization"] or not captured["cid"]:
                print("  Todavía no detecté la sesión. Navegá por el catálogo para generar una request de API.")
        print("  Sesión capturada (token protegido; no se muestra).")
        cards = fetch_catalog(context.request, captured["authorization"], captured["cid"])
        browser.close()

    items = [normalize(card) for card in cards]
    with_price = sum(1 for item in items if item.get("cost") is not None)
    print(f"Catálogo completo: {len(items)} productos; {with_price} con precio B2B.")
    if not items:
        raise SystemExit("Juntos+ no devolvió productos; no se envió ningún lote.")

    print("Empujando a StockRápido…")
    pushed = 0
    for start in range(0, len(items), PUSH_BATCH):
        batch = items[start:start + PUSH_BATCH]
        result = sr_push(sr_token, connection_id, batch)
        pushed += int(result.get("itemsUpserted", 0))
        print(f"  lote {start // PUSH_BATCH + 1}: {min(start + len(batch), len(items))}/{len(items)}")
    print(f"Listo. {pushed} productos sincronizados en StockRápido.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        raise SystemExit("Cancelado por el usuario.")
    except Exception as error:
        raise SystemExit(f"Error: {error}") from error
