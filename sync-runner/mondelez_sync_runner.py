#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RUNNER de sincronización Mondelez -> StockRápido.

Hace el login con TU teléfono (precio real B2B) + baja todos los campos
(imagen, EAN, marca, categoría, unidades por bulto, peso, etc.) y los EMPUJA
al backend de StockRápido (módulo de Sincronizaciones).

Corre donde haya navegador (tu PC o un runner agendado). Vercel no corre
navegador, por eso el precio real lo aporta este runner.

Requisitos (una vez):
    python -m pip install playwright
    python -m playwright install chromium

Config por variables de entorno:
    SR_API        URL del backend StockRápido
    SR_EMAIL      tu email de StockRápido
    SR_PASSWORD   tu contraseña de StockRápido

El teléfono y la contraseña de Mondelez se cargan en Configuración →
Proveedores dentro de StockRápido. Si faltan, el login queda interactivo.

Uso:  python mondelez_sync_runner.py
"""

import json
import os
import time
import urllib.request
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright

# El .env contiene solo el acceso a StockRápido. Las credenciales del proveedor
# se leen cifradas desde Configuración → Proveedores.
def _load_dotenv():
    here = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(here):
        for ln in open(here, encoding="utf-8"):
            ln = ln.strip()
            if ln and not ln.startswith("#") and "=" in ln:
                k, _, v = ln.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


_load_dotenv()
SR_API = os.environ.get("SR_API", "https://stockrapido-api.vercel.app")
SR_EMAIL = os.environ.get("SR_EMAIL", "")
SR_PASSWORD = os.environ.get("SR_PASSWORD", "")
if not all([SR_EMAIL, SR_PASSWORD]):
    raise SystemExit(
        "Faltan credenciales. Creá sync-runner/.env con:\n"
        "  SR_EMAIL=...\n  SR_PASSWORD=...\n"
    )

BASE = "https://www.mitiendamondelez.com.ar"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36"
PAGE = 50
SIM_BATCH = 40


# ---------------- StockRápido API ----------------
def sr_login():
    body = json.dumps({"email": SR_EMAIL, "password": SR_PASSWORD}).encode()
    req = urllib.request.Request(SR_API + "/auth/login", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req, timeout=40).read())["accessToken"]


def sr_get_connection(token):
    req = urllib.request.Request(SR_API + "/sync/connections",
                                 headers={"Authorization": "Bearer " + token})
    conns = json.loads(urllib.request.urlopen(req, timeout=40).read())
    for c in conns:
        if c["provider"] == "mondelez":
            return c["id"]
    # crear si no existe
    body = json.dumps({"provider": "mondelez", "name": "Mondelez", "priceMarkup": 40}).encode()
    req = urllib.request.Request(SR_API + "/sync/connections", data=body,
                                 headers={"Authorization": "Bearer " + token,
                                          "Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req, timeout=40).read())["id"]


def sr_push(token, conn_id, items):
    body = json.dumps({"items": items}).encode()
    req = urllib.request.Request(SR_API + f"/sync/connections/{conn_id}/push", data=body,
                                 headers={"Authorization": "Bearer " + token,
                                          "Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req, timeout=120).read())


def sr_get_secrets(token, conn_id):
    try:
        req = urllib.request.Request(
            SR_API + f"/sync/connections/{conn_id}/credentials-secret",
            headers={"Authorization": "Bearer " + token},
        )
        return json.loads(urllib.request.urlopen(req, timeout=40).read())
    except Exception as error:
        print("No se pudieron leer credenciales guardadas; sigo en modo interactivo:", str(error)[:100])
        return {"credentials": None, "session": None, "sessionExpiresAt": None}


def sr_save_session(token, conn_id, session, expires_at=None):
    payload = {"session": session}
    if expires_at:
        payload["expiresAt"] = expires_at
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        SR_API + f"/sync/connections/{conn_id}/session",
        data=body,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
        method="PATCH",
    )
    urllib.request.urlopen(req, timeout=40).read()


# ---------------- Mondelez (Playwright) ----------------
def mdlz_login(ctx, credentials):
    pg = ctx.new_page()
    pg.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(2500)
    if any("VtexIdclientAutCookie" in cookie["name"] for cookie in ctx.cookies()):
        pg.close()
        return True
    for t in ["Aceptar Cookies", "Aceptar", "ACEPTAR"]:
        try:
            pg.click(f"text={t}", timeout=1200); break
        except Exception:
            pass
    phone = credentials.get("phone") if isinstance(credentials, dict) else None
    password = credentials.get("password") if isinstance(credentials, dict) else None
    if phone and password:
        pg.click("text=Ingresar", timeout=10000)
        pg.wait_for_load_state("networkidle", timeout=30000)
        pg.wait_for_timeout(3500)
        pg.fill("input[name=celular]", str(phone))
        pg.fill("input[name=password]", str(password))
        pg.click("text=INICIAR SESI")
    else:
        input("No hay credenciales Mondelez cargadas. Logueate en el navegador y presioná Enter: ")
    pg.wait_for_timeout(8000)
    try:
        pg.wait_for_load_state("networkidle", timeout=30000)
    except Exception:
        pass
    ok = any("VtexIdclientAutCookie" in c["name"] for c in ctx.cookies())
    if not ok:
        input("No pude validar la sesión automáticamente. Completá el login en el navegador y presioná Enter: ")
        ok = any("VtexIdclientAutCookie" in cookie["name"] for cookie in ctx.cookies())
    pg.close()
    return ok


def cookie_expiry_iso(cookies):
    expiries = [cookie.get("expires") for cookie in cookies if (cookie.get("expires") or 0) > 0]
    return datetime.fromtimestamp(max(expiries), timezone.utc).isoformat() if expiries else None


def spec(p, key):
    v = p.get(key)
    if isinstance(v, list):
        return v[0] if v else None
    return v


def ref_id(item):
    for reference in item.get("referenceId") or []:
        if isinstance(reference, dict) and reference.get("Key") == "RefId":
            return reference.get("Value")
    return item.get("RefId")


def mdlz_fetch_catalog(rq):
    tree = rq.get(BASE + "/api/catalog_system/pub/category/tree/10").json()
    cat_ids = []

    def walk(nodes):
        for n in nodes or []:
            cat_ids.append(n["id"])
            if n.get("children"):
                walk(n["children"])
    walk(tree)
    seen, items = set(), []
    for cid in cat_ids:
        frm = 0
        while True:
            url = f"{BASE}/api/catalog_system/pub/products/search?fq=C:/{cid}/&_from={frm}&_to={frm+PAGE-1}"
            r = rq.get(url)
            batch = r.json() if r.ok else []
            if not batch:
                break
            for p in batch:
                pid = str(p.get("productId"))
                if pid in seen:
                    continue
                seen.add(pid)
                it = (p.get("items") or [{}])[0]
                offer = ((it.get("sellers") or [{}])[0]).get("commertialOffer", {})
                img = (it.get("images") or [{}])[0]
                cats = (p.get("categories") or [""])[0].split("/")
                cats = [c for c in cats if c]
                reference = p.get("productReference") or ref_id(it)
                units_per_display = spec(p, "Unidades por Display")
                items.append({
                    "externalId": pid,
                    "sku": str(it.get("itemId")) if it.get("itemId") else None,
                    "ean": it.get("ean"),
                    "eanUnit": it.get("ean"),
                    "supplierRef": reference,
                    "ivaAlicuota": None,
                    "name": p.get("productName"),
                    "brand": p.get("brand"),
                    "category": cats[0] if cats else None,
                    "subcategory": spec(p, "Subcategoría") or (cats[1] if len(cats) > 1 else None),
                    "available": bool(offer.get("IsAvailable")),
                    "stock": offer.get("AvailableQuantity"),
                    "unitsPerBox": units_per_display,
                    "unitsPerDisplay": units_per_display,
                    "weight": spec(p, "Peso"),
                    "format": spec(p, "Formato"),
                    "flavor": spec(p, "Sabor"),
                    "presentation": spec(p, "Presentación"),
                    "imageUrl": img.get("imageUrl"),
                    "link": p.get("link"),
                    "raw": p,
                    "variants": [{
                        "uom": "UN",
                        "multiplier": 1,
                        "skuId": str(it.get("itemId")) if it.get("itemId") else None,
                        "refId": reference,
                        "ean": it.get("ean"),
                        "listPrice": offer.get("ListPrice"),
                        "sellingPrice": offer.get("Price"),
                        "cost": None,
                        "stock": offer.get("AvailableQuantity"),
                    }],
                })
            if len(batch) < PAGE:
                break
            frm += PAGE
            time.sleep(0.15)
    return items


def mdlz_fetch_prices(rq, sku_ids, batch=50):
    """{sku: cost} con TU precio real B2B.

    Lee el precio agregando los SKUs a TU carrito autenticado (orderForm) — que es
    exactamente el precio que ves/pagás vos. La simulación pública no es confiable
    (devuelve placeholder o precios que no son los de tu cuenta).
    """
    out = {}
    for i in range(0, len(sku_ids), batch):
        chunk = sku_ids[i:i + batch]
        try:
            of = rq.post(BASE + "/api/checkout/pub/orderForm", data="{}",
                         headers={"Content-Type": "application/json"}).json()["orderFormId"]
            rq.post(
                BASE + f"/api/checkout/pub/orderForm/{of}/items",
                data=json.dumps({"orderItems": [{"id": s, "quantity": 1, "seller": "1"} for s in chunk]}),
                headers={"Content-Type": "application/json"},
            )
            of2 = rq.get(BASE + f"/api/checkout/pub/orderForm/{of}").json()
            for it in of2.get("items", []):
                price = (it.get("price") or 0) / 100
                if price > 0 and price < 1000000:
                    out[str(it.get("id"))] = price
        except Exception as e:
            print("  batch precio error:", str(e)[:60])
        print(f"  precios {min(i + batch, len(sku_ids))}/{len(sku_ids)} (acum {len(out)})")
        time.sleep(0.3)
    return out


def main():
    print("Login StockRápido…")
    token = sr_login()
    conn_id = sr_get_connection(token)
    print("  conexión:", conn_id)
    secrets = sr_get_secrets(token, conn_id)
    credentials = secrets.get("credentials") if isinstance(secrets.get("credentials"), dict) else {}

    with sync_playwright() as p:
        b = p.chromium.launch(headless=False)
        ctx = b.new_context(user_agent=UA)
        stored_session = secrets.get("session")
        if isinstance(stored_session, dict) and isinstance(stored_session.get("cookies"), list):
            try:
                ctx.add_cookies(stored_session["cookies"])
            except Exception:
                pass
        print("Login Mondelez (teléfono)…")
        if not mdlz_login(ctx, credentials):
            print("  FALLO el login de Mondelez"); b.close(); return
        print("  OK")
        cookies = ctx.cookies()
        sr_save_session(token, conn_id, {"cookies": cookies}, cookie_expiry_iso(cookies))
        print("  Sesión guardada de forma cifrada en StockRápido.")
        rq = ctx.request
        print("Bajando catálogo…")
        items = mdlz_fetch_catalog(rq)
        print(f"  {len(items)} productos")
        skus = [it["sku"] for it in items if it.get("sku")]
        print("Trayendo precios reales (simulación)…")
        prices = mdlz_fetch_prices(rq, skus)
        for it in items:
            c = prices.get(it.get("sku"))
            if c is not None:
                it["cost"] = c
                it["variants"][0]["cost"] = c
        b.close()

    con_precio = sum(1 for it in items if it.get("cost") is not None)
    print(f"Con precio real: {con_precio}/{len(items)}")
    print("Empujando a StockRápido…")
    # en chunks para payloads chicos
    total = 0
    for i in range(0, len(items), 120):
        res = sr_push(token, conn_id, items[i:i + 120])
        total += res.get("itemsUpserted", 0)
    print(f"Listo. {total} productos sincronizados en StockRápido.")


if __name__ == "__main__":
    main()
