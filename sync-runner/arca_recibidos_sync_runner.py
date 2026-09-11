#!/usr/bin/env python3
"""
Sync de Mis Comprobantes → Recibidos (ARCA) sin Afip SDK.

Ingeniería inversa del portal (mismo enfoque que extensiones tipo
hack_mis_comprobantes / automatizaciones del navegador):

  1) Login Clave Fiscal con Playwright
  2) Abrir relación "Mis Comprobantes"
  3) ajax.do?f=generarConsulta&t=R + listaResultados
  4) Armar CSV e importar a StockRápido POST /fiscal/received/import

Corre en tu PC (Vercel no puede abrir Chromium). Afip SDK sigue siendo
la opción cloud; este runner es la alternativa local gratis.

Config (sync-runner/.env):
  SR_API=https://api.stockrapido.store
  SR_EMAIL=...
  SR_PASSWORD=...
  AFIP_CUIT=20xxxxxxxx
  AFIP_PASSWORD=clave_fiscal
  AFIP_HEADLESS=1          # 0 si hay CAPTCHA/2FA
  AFIP_FROM=YYYY-MM-DD     # opcional
  AFIP_TO=YYYY-MM-DD       # opcional

Uso:
  python arca_recibidos_sync_runner.py
  python arca_recibidos_sync_runner.py --from 2026-01-01 --to 2026-03-31 --headed
  python arca_recibidos_sync_runner.py --dry-run --dump-json /tmp/recibidos.json
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests
from dotenv import load_dotenv
from playwright.sync_api import BrowserContext, Page, sync_playwright

AUTH_URL = "https://auth.afip.gob.ar/contribuyente_/login.xhtml"
PORTAL_HOME = "https://portalcf.cloud.afip.gob.ar/portal/app/"

# Hosts históricos / actuales del aplicativo Mis Comprobantes
MCMP_HOSTS = (
    "https://fes.afip.gob.ar",
    "https://serviciosjava2.afip.gob.ar",
    "https://serviciosjava.afip.gob.ar",
)

# Índices del array que devuelve listaResultados (extensión hack_mis_comprobantes)
# CSV oficial ARCA usa nombres parecidos; el import de StockRápido los reconoce.
ROW_IDX = {
    "fecha": 0,
    "tipo": 1,
    "punto_venta": 3,
    "numero_desde": 4,
    "numero_hasta": 5,
    "cod_autorizacion": 8,
    "tipo_doc_emisor": 10,
    "nro_doc_emisor": 11,
    "denominacion_emisor": 12,
    "tipo_cambio": 13,
    "moneda": 14,
    "neto_gravado": 15,
    "neto_no_gravado": 17,
    "exentas": 19,
    "iva": 21,
    "total": 23,
}

CSV_HEADERS = [
    "Fecha de Emisión",
    "Tipo de Comprobante",
    "Punto de Venta",
    "Número Desde",
    "Número Hasta",
    "Cód. Autorización",
    "Tipo Doc. Emisor",
    "Nro. Doc. Emisor",
    "Denominación Emisor",
    "Tipo Cambio",
    "Moneda",
    "Imp. Neto Gravado",
    "Imp. Neto No Gravado",
    "Imp. Op. Exentas",
    "Otros Tributos",
    "IVA",
    "Imp. Total",
]


def env(name: str, default: str | None = None) -> str | None:
    v = os.getenv(name)
    if v is None or not str(v).strip():
        return default
    return str(v).strip()


def require_env(*names: str) -> str:
    for name in names:
        v = env(name)
        if v:
            return v
    raise SystemExit(f"Falta variable de entorno: {' o '.join(names)}")


def parse_date(s: str | None, fallback: date) -> date:
    if not s:
        return fallback
    return datetime.strptime(s, "%Y-%m-%d").date()


def chunk_ranges(d_from: date, d_to: date, days: int = 30) -> list[tuple[date, date]]:
    """ARCA limita ~31 días corridos por consulta."""
    out: list[tuple[date, date]] = []
    cur = d_from
    while cur <= d_to:
        end = min(cur + timedelta(days=days - 1), d_to)
        out.append((cur, end))
        cur = end + timedelta(days=1)
    return out


def api_login(api_url: str, email: str, password: str) -> str:
    r = requests.post(
        f"{api_url.rstrip('/')}/auth/login",
        json={"email": email, "password": password},
        timeout=60,
    )
    r.raise_for_status()
    token = r.json().get("accessToken")
    if not token:
        raise RuntimeError("Login StockRápido sin accessToken")
    return token


def api_import_csv(api_url: str, token: str, csv_text: str) -> dict[str, Any]:
    r = requests.post(
        f"{api_url.rstrip('/')}/fiscal/received/import",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={"csv": csv_text},
        timeout=120,
    )
    if not r.ok:
        raise RuntimeError(f"Import falló {r.status_code}: {r.text[:500]}")
    return r.json()


def wait_cf_login(page: Page, cuit: str, password: str, headless: bool) -> None:
    page.goto(AUTH_URL, wait_until="domcontentloaded", timeout=90_000)
    page.wait_for_timeout(800)

    for sel in [
        'input[name="F1:username"]',
        "#F1\\:username",
        'input[id*="username"]',
        'input[type="text"]',
    ]:
        try:
            el = page.locator(sel).first
            if el.count() and el.is_visible(timeout=2000):
                el.fill(cuit)
                break
        except Exception:
            continue

    for sel in ['button:has-text("Siguiente")', 'input[value="Siguiente"]', "#F1\\:btnSiguiente"]:
        try:
            btn = page.locator(sel).first
            if btn.count() and btn.is_visible(timeout=1500):
                btn.click()
                break
        except Exception:
            continue

    page.wait_for_timeout(1200)

    for sel in [
        'input[name="F1:password"]',
        "#F1\\:password",
        'input[type="password"]',
    ]:
        try:
            el = page.locator(sel).first
            if el.count() and el.is_visible(timeout=3000):
                el.fill(password)
                break
        except Exception:
            continue

    for sel in [
        'button:has-text("Ingresar")',
        'input[value="Ingresar"]',
        "#F1\\:btnIngresar",
    ]:
        try:
            btn = page.locator(sel).first
            if btn.count() and btn.is_visible(timeout=1500):
                btn.click()
                break
        except Exception:
            continue

    deadline = time.time() + (300 if not headless else 90)
    while time.time() < deadline:
        url = page.url.lower()
        content = ""
        try:
            content = page.content().lower()
        except Exception:
            pass
        if "captcha" in content or "recaptcha" in content:
            if headless:
                raise RuntimeError(
                    "ARCA pidió CAPTCHA. Corré con --headed o AFIP_HEADLESS=0 y resolvelo a mano."
                )
            print(">>> CAPTCHA detectado. Completalo en el navegador…")
            page.wait_for_timeout(5000)
            continue
        if any(x in content for x in ("doble factor", "segundo factor", "autenticación", "otp")):
            if headless:
                raise RuntimeError(
                    "ARCA pidió 2FA. Corré con --headed o AFIP_HEADLESS=0 y completalo."
                )
            print(">>> 2FA detectado. Completalo en el navegador…")
            page.wait_for_timeout(5000)
            continue
        if "login" not in url and (
            "portalcf" in url or "contribuyente" in url or "mis comprobantes" in content or "fes.afip" in url
        ):
            return
        page.wait_for_timeout(1500)

    raise RuntimeError("Timeout esperando login Clave Fiscal")


def open_mis_comprobantes(page: Page, context: BrowserContext) -> Page:
    page.goto(PORTAL_HOME, wait_until="domcontentloaded", timeout=90_000)
    page.wait_for_timeout(2000)

    for sel in [
        'input[placeholder*="Buscá"]',
        'input[placeholder*="Busca"]',
        'input[type="search"]',
        "#buscadorInput",
    ]:
        try:
            el = page.locator(sel).first
            if el.count() and el.is_visible(timeout=2000):
                el.fill("Mis Comprobantes")
                page.wait_for_timeout(800)
                break
        except Exception:
            continue

    clicked = False
    for sel in [
        'text=Mis Comprobantes',
        'a:has-text("Mis Comprobantes")',
        '[title*="Mis Comprobantes"]',
    ]:
        try:
            el = page.locator(sel).first
            if el.count() and el.is_visible(timeout=2000):
                try:
                    with context.expect_page(timeout=15_000) as new_page_info:
                        el.click()
                    mcmp = new_page_info.value
                    mcmp.wait_for_load_state("domcontentloaded")
                    return mcmp
                except Exception:
                    el.click()
                    page.wait_for_timeout(3000)
                    clicked = True
                    break
        except Exception:
            continue

    if clicked:
        for p in context.pages:
            if any(h in p.url for h in ("mcmp", "fes.afip", "comprobantes")):
                return p
        return page

    # Fallback: hosts conocidos (requiere cookie de sesión del portal)
    for host in MCMP_HOSTS:
        try:
            page.goto(f"{host}/mcmp/", wait_until="domcontentloaded", timeout=45_000)
            if "login" not in page.url.lower():
                return page
        except Exception:
            continue
    return page


def resolve_ajax_base(page: Page) -> str:
    url = page.url or ""
    for host in MCMP_HOSTS:
        if host.replace("https://", "") in url:
            return f"{host}/mcmp/jsp/ajax.do"
    # Default actual según extensión comunitaria
    return f"{MCMP_HOSTS[0]}/mcmp/jsp/ajax.do"


def sr_json(page: Page, url: str) -> Any:
    raw = page.evaluate(
        """async (url) => {
          const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Accept': 'application/json, text/javascript, */*; q=0.01',
              'X-Requested-With': 'XMLHttpRequest',
            },
          });
          const text = await res.text();
          return { ok: res.ok, status: res.status, text };
        }""",
        url,
    )
    if not raw.get("ok"):
        raise RuntimeError(f"ajax ARCA HTTP {raw.get('status')}: {str(raw.get('text'))[:300]}")
    text = raw.get("text") or ""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"(\{.*\}|\[.*\])", text, re.S)
        if not m:
            raise RuntimeError(f"Respuesta no JSON: {text[:300]}")
        return json.loads(m.group(1))


def fetch_recibidos(page: Page, ajax_base: str, cuit: str, d_from: date, d_to: date) -> list[Any]:
    # Formato exacto del portal: "dd/mm/yyyy - dd/mm/yyyy" (espacios alrededor del guión)
    fecha = f"{d_from.strftime('%d/%m/%Y')} - {d_to.strftime('%d/%m/%Y')}"
    # Encodeamos barras pero dejamos espacios como %20 vía quote
    fecha_q = quote(fecha, safe="")
    url = (
        f"{ajax_base}?f=generarConsulta"
        f"&t=R"
        f"&fechaEmision={fecha_q}"
        f"&tiposComprobantes="
        f"&cuitConsultada={quote(cuit)}"
    )
    print(f"  generarConsulta {fecha} …")
    gen = sr_json(page, url)

    if isinstance(gen, dict) and str(gen.get("estado", "ok")).lower() not in ("ok", ""):
        raise RuntimeError(f"generarConsulta: {gen.get('mensajeError') or gen}")

    consulta_id = None
    if isinstance(gen, dict):
        datos = gen.get("datos") if isinstance(gen.get("datos"), dict) else {}
        if isinstance(datos, dict):
            consulta_id = datos.get("idConsulta") or datos.get("id")
        if not consulta_id:
            consulta_id = gen.get("idConsulta") or gen.get("id")
        data = gen.get("data")
        if not consulta_id and isinstance(data, dict):
            consulta_id = data.get("idConsulta") or data.get("id")

    if not consulta_id:
        raise RuntimeError(f"No pude obtener idConsulta: {json.dumps(gen, ensure_ascii=False)[:400]}")

    page.wait_for_timeout(1200)
    list_url = f"{ajax_base}?f=listaResultados&id={quote(str(consulta_id))}"
    print(f"  listaResultados id={consulta_id} …")
    listing = sr_json(page, list_url)

    if isinstance(listing, dict) and str(listing.get("estado", "ok")).lower() not in ("ok", ""):
        raise RuntimeError(f"listaResultados: {listing.get('mensajeError') or listing}")

    rows: list[Any] = []
    if isinstance(listing, list):
        rows = listing
    elif isinstance(listing, dict):
        datos = listing.get("datos")
        if isinstance(datos, dict) and isinstance(datos.get("data"), list):
            rows = datos["data"]
        elif isinstance(datos, list):
            rows = datos
        else:
            for key in ("data", "resultado", "comprobantes", "rows", "lista"):
                val = listing.get(key)
                if isinstance(val, list):
                    rows = val
                    break
                if isinstance(val, dict) and isinstance(val.get("data"), list):
                    rows = val["data"]
                    break

    print(f"  → {len(rows)} comprobantes")
    return rows


def cell(row: Any, idx: int) -> str:
    if isinstance(row, (list, tuple)):
        if idx < len(row) and row[idx] is not None:
            return str(row[idx]).strip()
        return ""
    if isinstance(row, dict):
        # Si viniera ya tipado (poco frecuente en el portal crudo)
        return ""
    return ""


def pick_dict(row: dict[str, Any], *keys: str) -> str:
    lower = {str(k).lower(): v for k, v in row.items()}
    for k in keys:
        if k in row and row[k] not in (None, ""):
            return str(row[k]).strip()
        if k.lower() in lower and lower[k.lower()] not in (None, ""):
            return str(lower[k.lower()]).strip()
    return ""


def format_fecha(val: str) -> str:
    if not val:
        return ""
    s = val.strip()
    if re.fullmatch(r"\d{8}", s):
        return f"{s[6:8]}/{s[4:6]}/{s[0:4]}"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        y, m, d = s.split("-")
        return f"{d}/{m}/{y}"
    return s


def normalize_row(row: Any) -> dict[str, str]:
    if isinstance(row, dict):
        return {
            "fecha": format_fecha(
                pick_dict(row, "Fecha de Emisión", "fechaEmision", "fecha", "Fecha")
            ),
            "tipo": pick_dict(row, "Tipo de Comprobante", "tipoComprobante", "tipo", "Tipo"),
            "punto_venta": pick_dict(row, "Punto de Venta", "puntoVenta", "ptoVta"),
            "numero_desde": pick_dict(row, "Número Desde", "numeroDesde", "numero", "nroComprobante"),
            "numero_hasta": pick_dict(row, "Número Hasta", "numeroHasta")
            or pick_dict(row, "Número Desde", "numeroDesde", "numero"),
            "cod_autorizacion": pick_dict(row, "Cód. Autorización", "codAutorizacion", "cae", "CAE"),
            "tipo_doc_emisor": pick_dict(row, "Tipo Doc. Emisor", "tipoDocEmisor") or "80",
            "nro_doc_emisor": pick_dict(row, "Nro. Doc. Emisor", "nroDocEmisor", "cuitEmisor", "cuit"),
            "denominacion_emisor": pick_dict(
                row, "Denominación Emisor", "denominacionEmisor", "razonSocial", "nombre"
            ),
            "tipo_cambio": pick_dict(row, "Tipo Cambio", "tipoCambio") or "1",
            "moneda": pick_dict(row, "Moneda", "moneda") or "PES",
            "neto_gravado": pick_dict(row, "Imp. Neto Gravado", "impNetoGravado") or "0",
            "neto_no_gravado": pick_dict(row, "Imp. Neto No Gravado", "impNetoNoGravado") or "0",
            "exentas": pick_dict(row, "Imp. Op. Exentas", "impOpExentas") or "0",
            "otros": pick_dict(row, "Otros Tributos", "otrosTributos") or "0",
            "iva": pick_dict(row, "IVA", "iva", "impIVA") or "0",
            "total": pick_dict(row, "Imp. Total", "impTotal", "importeTotal", "total"),
        }

    return {
        "fecha": format_fecha(cell(row, ROW_IDX["fecha"])),
        "tipo": cell(row, ROW_IDX["tipo"]),
        "punto_venta": cell(row, ROW_IDX["punto_venta"]),
        "numero_desde": cell(row, ROW_IDX["numero_desde"]),
        "numero_hasta": cell(row, ROW_IDX["numero_hasta"]) or cell(row, ROW_IDX["numero_desde"]),
        "cod_autorizacion": cell(row, ROW_IDX["cod_autorizacion"]),
        "tipo_doc_emisor": cell(row, ROW_IDX["tipo_doc_emisor"]) or "80",
        "nro_doc_emisor": cell(row, ROW_IDX["nro_doc_emisor"]),
        "denominacion_emisor": cell(row, ROW_IDX["denominacion_emisor"]),
        "tipo_cambio": cell(row, ROW_IDX["tipo_cambio"]) or "1",
        "moneda": cell(row, ROW_IDX["moneda"]) or "PES",
        "neto_gravado": cell(row, ROW_IDX["neto_gravado"]) or "0",
        "neto_no_gravado": cell(row, ROW_IDX["neto_no_gravado"]) or "0",
        "exentas": cell(row, ROW_IDX["exentas"]) or "0",
        "otros": "0",
        "iva": cell(row, ROW_IDX["iva"]) or "0",
        "total": cell(row, ROW_IDX["total"]),
    }


def rows_to_csv(rows: list[Any]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(CSV_HEADERS)
    for raw in rows:
        r = normalize_row(raw)
        if not r["fecha"] or not r["nro_doc_emisor"] or not r["punto_venta"] or not r["total"]:
            continue
        w.writerow(
            [
                r["fecha"],
                r["tipo"],
                r["punto_venta"],
                r["numero_desde"],
                r["numero_hasta"],
                r["cod_autorizacion"],
                r["tipo_doc_emisor"],
                r["nro_doc_emisor"],
                r["denominacion_emisor"],
                r["tipo_cambio"],
                r["moneda"],
                r["neto_gravado"],
                r["neto_no_gravado"],
                r["exentas"],
                r["otros"],
                r["iva"],
                r["total"],
            ]
        )
    return buf.getvalue()


def main() -> int:
    load_dotenv(Path(__file__).with_name(".env"))
    load_dotenv()

    parser = argparse.ArgumentParser(
        description="Sync ARCA Mis Comprobantes Recibidos → StockRápido (sin Afip SDK)"
    )
    parser.add_argument("--from", dest="date_from", default=None)
    parser.add_argument("--to", dest="date_to", default=None)
    parser.add_argument("--headed", action="store_true", help="Mostrar navegador (CAPTCHA/2FA)")
    parser.add_argument("--dry-run", action="store_true", help="No importa a la API")
    parser.add_argument("--dump-json", default=None, help="Guardar JSON crudo")
    args = parser.parse_args()

    api_url = require_env("SR_API", "API_URL")
    email = require_env("SR_EMAIL", "EMAIL")
    password = require_env("SR_PASSWORD", "PASSWORD")
    afip_cuit = re.sub(r"\D", "", require_env("AFIP_CUIT"))
    afip_password = require_env("AFIP_PASSWORD")

    today = date.today()
    d_from = parse_date(args.date_from or env("AFIP_FROM"), today - timedelta(days=30))
    d_to = parse_date(args.date_to or env("AFIP_TO"), today)
    if d_from > d_to:
        raise SystemExit("--from no puede ser mayor que --to")

    headless = not args.headed and env("AFIP_HEADLESS", "1") != "0"
    print(f"Rango: {d_from} → {d_to} | headless={headless}")

    token = api_login(api_url, email, password)
    print("Login StockRápido OK")

    all_rows: list[Any] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=headless,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            locale="es-AR",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()
        print("Login ARCA Clave Fiscal…")
        wait_cf_login(page, afip_cuit, afip_password, headless)
        print("Login ARCA OK")

        print("Abriendo Mis Comprobantes…")
        mcmp = open_mis_comprobantes(page, context)
        mcmp.wait_for_timeout(2000)
        ajax_base = resolve_ajax_base(mcmp)
        print(f"MCMP url: {mcmp.url}")
        print(f"ajax: {ajax_base}")

        for a, b in chunk_ranges(d_from, d_to, 30):
            try:
                rows = fetch_recibidos(mcmp, ajax_base, afip_cuit, a, b)
                all_rows.extend(rows)
            except Exception as e:
                # Reintentar con otro host si el actual falló
                last_err = e
                recovered = False
                for host in MCMP_HOSTS:
                    alt = f"{host}/mcmp/jsp/ajax.do"
                    if alt == ajax_base:
                        continue
                    try:
                        print(f"  reintento con {alt} …")
                        rows = fetch_recibidos(mcmp, alt, afip_cuit, a, b)
                        all_rows.extend(rows)
                        ajax_base = alt
                        recovered = True
                        break
                    except Exception as e2:
                        last_err = e2
                if not recovered:
                    print(f"ERROR en rango {a}–{b}: {last_err}", file=sys.stderr)
                    try:
                        shot = Path(__file__).with_name(f"arca_error_{a}_{b}.png")
                        mcmp.screenshot(path=str(shot), full_page=True)
                        print(f"Screenshot: {shot}", file=sys.stderr)
                    except Exception:
                        pass
                    raise last_err

        browser.close()

    seen: set[str] = set()
    unique: list[Any] = []
    for row in all_rows:
        n = normalize_row(row)
        key = "|".join(
            [
                n["cod_autorizacion"],
                n["punto_venta"],
                n["numero_desde"],
                n["nro_doc_emisor"],
            ]
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)

    print(f"Total filas: {len(all_rows)} | únicas: {len(unique)}")

    if args.dump_json:
        Path(args.dump_json).write_text(
            json.dumps(unique, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"JSON: {args.dump_json}")

    if not unique:
        print("Sin comprobantes en el rango.")
        return 0

    csv_text = rows_to_csv(unique)
    dump_csv = Path(__file__).with_name("arca_recibidos_last.csv")
    dump_csv.write_text(csv_text, encoding="utf-8")
    print(f"CSV local: {dump_csv}")

    if args.dry_run:
        print("Dry-run: no se importa a la API.")
        return 0

    result = api_import_csv(api_url, token, csv_text)
    print("Import OK:", json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
