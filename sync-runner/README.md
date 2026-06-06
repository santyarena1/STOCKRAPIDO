# Sync Runner — Mondelez → StockRápido (Vercel + Neon)

Trae el catálogo de Mondelez con **tu precio real B2B** (login con teléfono) y lo empuja a la API en **Vercel**.

El runner corre **en tu PC** (Playwright). Vercel no ejecuta navegador, por eso los precios B2B los aporta este proceso local.

## Configuración

1. API y web desplegadas según [DEPLOY.md](../DEPLOY.md) (Vercel + Neon).
2. Copiá `.env.example` → `.env`:

| Variable | Valor |
|----------|--------|
| `SR_API` | `https://stockrapido-api.vercel.app` (tu proyecto API en Vercel) |
| `SR_EMAIL` | Usuario StockRápido |
| `SR_PASSWORD` | Contraseña StockRápido |
| `MDLZ_PHONE` | Teléfono Mi Tienda Mondelez |
| `MDLZ_PASSWORD` | Contraseña Mondelez |

## Uso

```bash
python -m pip install playwright
python -m playwright install chromium
python mondelez_sync_runner.py
```

Agendalo con Task Scheduler (Windows) o cron.

## Flujo

```
Catálogo VTEX (cron Vercel)  →  productos sin costo B2B
Runner local                 →  costo por bulto → POST /sync/.../push
Importar en la web           →  costo/venta c/u en tu catálogo y POS
```
