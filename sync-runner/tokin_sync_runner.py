#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RUNNER Tokin (Arcor) -> StockRápido mediante harvest del navegador.

Requisitos:
    python -m pip install playwright
    python -m playwright install chromium

Configuración en sync-runner/.env:
    SR_API=https://stockrapido-api.vercel.app
    SR_EMAIL=tu-email-stockrapido
    SR_PASSWORD=tu-password-stockrapido

Uso:
    python tokin_sync_runner.py

El login de Tokin es interactivo. El runner escucha las respuestas de
`/store/api/search`, recorre las vistas de catálogo que encuentra y conserva
el producto original completo en `raw`. No imprime cookies ni tokens.
"""

import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

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
TOKIN_URL = "https://tokintienda.com.ar/store/home"
PUSH_BATCH = 100

if not SR_EMAIL or not SR_PASSWORD:
    raise SystemExit("Faltan SR_EMAIL/SR_PASSWORD en sync-runner/.env.")


def _sr_json(path, token=None, method="GET", payload=None, timeout=60):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(SR_API + path, data=data, headers=headers, method=method)
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
        if connection.get("provider") == "tokin":
            return connection["id"]
    created = _sr_json(
        "/sync/connections",
        token=token,
        method="POST",
        payload={"provider": "tokin", "name": "Tokin (Arcor)", "priceMarkup": 40},
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


def sr_get_secrets(token, connection_id):
    try:
        return _sr_json(f"/sync/connections/{connection_id}/credentials-secret", token=token)
    except Exception as error:
        print(f"No se pudieron leer credenciales guardadas; sigo en modo interactivo: {str(error)[:100]}")
        return {"credentials": None, "session": None, "sessionExpiresAt": None}


def sr_save_session(token, connection_id, session, expires_at=None):
    payload = {"session": session}
    if expires_at:
        payload["expiresAt"] = expires_at
    _sr_json(
        f"/sync/connections/{connection_id}/session",
        token=token,
        method="PATCH",
        payload=payload,
    )


def cookie_expiry_iso(cookies):
    expiries = [cookie.get("expires") for cookie in cookies if (cookie.get("expires") or 0) > 0]
    return datetime.fromtimestamp(max(expiries), timezone.utc).isoformat() if expiries else None


def try_credential_login(page, credentials):
    user = credentials.get("user") if isinstance(credentials, dict) else None
    password = credentials.get("password") if isinstance(credentials, dict) else None
    if not user or not password:
        return False
    user_filled = False
    for selector in ["input[type=email]", "input[name=email]", "input[name=user]", "input[name=username]", "input[type=text]"]:
        try:
            field = page.locator(selector).first
            if field.is_visible():
                field.fill(str(user))
                user_filled = True
                break
        except Exception:
            pass
    if not user_filled:
        return False
    try:
        page.locator("input[type=password]").first.fill(str(password))
    except Exception:
        return False
    for selector in ["button[type=submit]", "button:has-text('Ingresar')", "button:has-text('Iniciar sesión')"]:
        try:
            button = page.locator(selector).first
            if button.is_visible():
                button.click()
                page.wait_for_timeout(5000)
                return True
        except Exception:
            pass
    return False


def number(value):
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            return float(value.replace(",", "."))
        except ValueError:
            return None
    return None


def integer(value):
    parsed = number(value)
    return int(parsed) if parsed is not None else None


def extract_products(payload):
    products = []

    def walk(node):
        if isinstance(node, dict):
            if node.get("productId") is not None and node.get("name") is not None:
                products.append(node)
                return
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(payload)
    return products


def first_ref(product):
    skus = product.get("skus") or []
    if isinstance(skus, dict):
        skus = [skus]
    for sku in skus:
        if isinstance(sku, dict):
            value = sku.get("ref_id") or sku.get("refId")
            if value:
                return str(value)
    return product.get("refId")


def normalize_variant(raw):
    price = raw.get("price") if isinstance(raw.get("price"), dict) else {}
    tax_group = raw.get("taxGroup") or []
    tax = tax_group[0] if tax_group and isinstance(tax_group[0], dict) else {}
    return {
        "uom": str(raw.get("uom") or "UN"),
        "multiplier": integer(raw.get("multiplier")) or 1,
        "skuId": str(raw["skuId"]) if raw.get("skuId") is not None else None,
        "refId": str(raw["refId"]) if raw.get("refId") is not None else None,
        "ean": str(raw["refId"]) if raw.get("refId") is not None else None,
        "listPrice": number(price.get("listPrice")),
        "sellingPrice": number(price.get("sellingPrice")),
        "priceWithTax": number(price.get("sellingPriceWithTax")),
        "cost": number(price.get("sellingPrice")),
        "stock": integer(raw.get("stock")),
        "taxAlicuota": number(tax.get("alicuota")),
        "sellerId": str(raw["sellerId"]) if raw.get("sellerId") is not None else None,
        "erpStatus": str(raw["erpStatus"]) if raw.get("erpStatus") is not None else None,
    }


def normalize(product):
    raw_variants = product.get("variants") if isinstance(product.get("variants"), list) else []
    variants = [normalize_variant(variant) for variant in raw_variants if isinstance(variant, dict)]
    unit_variant = next((variant for variant in variants if variant["uom"] == "UN"), variants[0] if variants else {})
    supplier_ref = first_ref(product) or unit_variant.get("refId")
    sku_id = product.get("skuId") or unit_variant.get("skuId")
    price_un = number(product.get("priceUN"))
    units_per_box = integer(product.get("unitsUNPerBU"))
    stock = integer(product.get("stockUN"))
    item = {
        "externalId": str(product.get("productId")),
        "supplierRef": str(supplier_ref) if supplier_ref is not None else None,
        "sku": str(sku_id) if sku_id is not None else None,
        "ean": str(unit_variant.get("ean")) if unit_variant.get("ean") else None,
        "eanUnit": str(unit_variant.get("ean")) if unit_variant.get("ean") else None,
        "name": product.get("name") or f"Producto {product.get('productId')}",
        "ivaAlicuota": number(product.get("ivaAlicuota")),
        "unitsPerBox": str(units_per_box) if units_per_box and units_per_box > 1 else None,
        "basePrice": price_un,
        "cost": price_un,
        "listPrice": number(product.get("listPriceUN")),
        "available": stock is None or stock > 0,
        "stock": stock,
        "variants": variants,
        "raw": product,
    }
    return {key: value for key, value in item.items() if value is not None}


def sweep_page(page):
    """Dispara lazy-load y paginadores comunes sin depender del markup exacto."""
    stable = 0
    previous_height = 0
    for _ in range(50):
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(700)
        height = page.evaluate("document.body.scrollHeight")
        stable = stable + 1 if height == previous_height else 0
        previous_height = height
        clicked = False
        for selector in [
            "button:has-text('Ver más')",
            "button:has-text('Cargar más')",
            "button:has-text('Siguiente')",
            "button[aria-label*='iguiente']",
        ]:
            try:
                button = page.locator(selector).last
                if button.is_visible() and button.is_enabled():
                    button.click()
                    page.wait_for_timeout(900)
                    clicked = True
                    break
            except Exception:
                pass
        if stable >= 3 and not clicked:
            break


def main():
    print("Iniciando sesión en StockRápido…")
    sr_token = sr_login()
    connection_id = sr_get_connection(sr_token)
    print(f"  conexión Tokin: {connection_id}")
    secrets = sr_get_secrets(sr_token, connection_id)
    credentials = secrets.get("credentials") if isinstance(secrets.get("credentials"), dict) else {}
    products = {}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        context = browser.new_context()
        stored_session = secrets.get("session")
        if isinstance(stored_session, dict) and isinstance(stored_session.get("cookies"), list):
            try:
                context.add_cookies(stored_session["cookies"])
            except Exception:
                pass
        page = context.new_page()

        def capture_response(response):
            if "/store/api/search" not in response.url or not response.ok:
                return
            try:
                for product in extract_products(response.json()):
                    products[str(product["productId"])] = product
                print(f"  capturados: {len(products)} productos", end="\r", flush=True)
            except Exception:
                pass

        page.on("response", capture_response)
        page.goto(TOKIN_URL, wait_until="domcontentloaded", timeout=90000)
        try_credential_login(page, credentials)
        input("Entrá al catálogo de Tokin (logueate si hace falta) y presioná Enter cuando estés dentro: ")
        cookies = context.cookies()
        sr_save_session(sr_token, connection_id, {"cookies": cookies}, cookie_expiry_iso(cookies))
        print("  Sesión guardada de forma cifrada en StockRápido.")
        sweep_page(page)

        links = page.locator("a[href]").evaluate_all(
            "els => els.map(a => a.href).filter(h => /categor|catalog|department/i.test(h))"
        )
        catalog_links = []
        for link in links:
            parsed = urlparse(urljoin(TOKIN_URL, link))
            if parsed.netloc.endswith("tokintienda.com.ar") and link not in catalog_links:
                catalog_links.append(link)
        if catalog_links:
            print(f"\nRecorriendo {len(catalog_links)} vistas de catálogo detectadas…")
        for index, link in enumerate(catalog_links[:200], 1):
            try:
                page.goto(link, wait_until="domcontentloaded", timeout=60000)
                sweep_page(page)
                print(f"  vista {index}/{min(len(catalog_links), 200)} · {len(products)} productos")
            except Exception as error:
                print(f"  vista {index}: {str(error)[:90]}")

        input("Si faltan categorías, recorrelas en el navegador. Presioná Enter para finalizar y enviar: ")
        page.wait_for_timeout(1000)
        browser.close()

    items = [normalize(product) for product in products.values()]
    with_variants = sum(1 for item in items if item.get("variants"))
    print(f"\nCatálogo Tokin: {len(items)} productos; {with_variants} con variantes.")
    if not items:
        raise SystemExit("No se capturaron productos. Navegá el catálogo antes de finalizar.")

    pushed = 0
    for start in range(0, len(items), PUSH_BATCH):
        batch = items[start:start + PUSH_BATCH]
        result = sr_push(sr_token, connection_id, batch)
        pushed += int(result.get("itemsUpserted", 0))
        print(f"  push {min(start + len(batch), len(items))}/{len(items)}")
        time.sleep(0.1)
    print(f"Listo. {pushed} productos Tokin sincronizados.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        raise SystemExit("Cancelado por el usuario.")
    except Exception as error:
        raise SystemExit(f"Error: {error}") from error
