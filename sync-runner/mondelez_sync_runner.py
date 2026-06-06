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

Config por variables de entorno (o editá los DEFAULT):
    SR_API        URL del backend StockRápido
    SR_EMAIL      tu email de StockRápido
    SR_PASSWORD   tu contraseña de StockRápido
    MDLZ_PHONE    tu teléfono de Mondelez
    MDLZ_PASSWORD tu contraseña de Mondelez

Uso:  python mondelez_sync_runner.py
"""

import json
import os
import time
import urllib.request

from playwright.sync_api import sync_playwright

# Credenciales: SIEMPRE por variables de entorno (no hardcodear claves en el repo).
# Cargá un archivo sync-runner/.env (gitignored) o exportá las variables.
def _load_dotenv():
    here = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(here):
        for ln in open(here, encoding="utf-8"):
            ln = ln.strip()
            if ln and not ln.startswith("#") and "=" in ln:
                k, _, v = ln.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


_load_dotenv()
SR_API = os.environ.get("SR_API", "https://stockrapido-api.onrender.com")
SR_EMAIL = os.environ.get("SR_EMAIL", "")
SR_PASSWORD = os.environ.get("SR_PASSWORD", "")
MDLZ_PHONE = os.environ.get("MDLZ_PHONE", "")
MDLZ_PASSWORD = os.environ.get("MDLZ_PASSWORD", "")

if not all([SR_EMAIL, SR_PASSWORD, MDLZ_PHONE, MDLZ_PASSWORD]):
    raise SystemExit(
        "Faltan credenciales. Creá sync-runner/.env con:\n"
        "  SR_EMAIL=...\n  SR_PASSWORD=...\n  MDLZ_PHONE=...\n  MDLZ_PASSWORD=...\n"
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


# ---------------- Mondelez (Playwright) ----------------
def mdlz_login(ctx):
    pg = ctx.new_page()
    pg.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(2500)
    for t in ["Aceptar Cookies", "Aceptar", "ACEPTAR"]:
        try:
            pg.click(f"text={t}", timeout=1200); break
        except Exception:
            pass
    pg.click("text=Ingresar", timeout=10000)
    pg.wait_for_load_state("networkidle", timeout=30000)
    pg.wait_for_timeout(3500)
    pg.fill("input[name=celular]", MDLZ_PHONE)
    pg.fill("input[name=password]", MDLZ_PASSWORD)
    pg.click("text=INICIAR SESI")
    pg.wait_for_timeout(8000)
    try:
        pg.wait_for_load_state("networkidle", timeout=30000)
    except Exception:
        pass
    ok = any("VtexIdclientAutCookie" in c["name"] for c in ctx.cookies())
    pg.close()
    return ok


def spec(p, key):
    v = p.get(key)
    if isinstance(v, list):
        return v[0] if v else None
    return v


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
                items.append({
                    "externalId": pid,
                    "sku": str(it.get("itemId")) if it.get("itemId") else None,
                    "ean": it.get("ean"),
                    "name": p.get("productName"),
                    "brand": p.get("brand"),
                    "category": cats[0] if cats else None,
                    "subcategory": spec(p, "Subcategoría") or (cats[1] if len(cats) > 1 else None),
                    "available": bool(offer.get("IsAvailable")),
                    "stock": offer.get("AvailableQuantity"),
                    "unitsPerBox": spec(p, "Unidades por Display"),
                    "weight": spec(p, "Peso"),
                    "format": spec(p, "Formato"),
                    "flavor": spec(p, "Sabor"),
                    "presentation": spec(p, "Presentación"),
                    "imageUrl": img.get("imageUrl"),
                    "link": p.get("link"),
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

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(user_agent=UA)
        print("Login Mondelez (teléfono)…")
        if not mdlz_login(ctx):
            print("  FALLO el login de Mondelez"); b.close(); return
        print("  OK")
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
