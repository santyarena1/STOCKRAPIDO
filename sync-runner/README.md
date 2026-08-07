# Sync Runner — proveedores → StockRápido (Vercel + Neon)

Trae catálogos y precios B2B de proveedores con sesión autenticada (Mondelez y Juntos+) y los empuja a la API en **Vercel**.

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

## Juntos+ — Coca-Cola FEMSA

Juntos+ usa OTP, por lo que el inicio de sesión es interactivo. El runner abre
Chromium en `https://ar.juntosplus.com/AR/login`: completá el login, entrá al
catálogo y presioná Enter en la terminal. El proceso captura de las requests del
navegador el Bearer y el `cid` sin imprimir el token.

No requiere variables adicionales: reutiliza `SR_API`, `SR_EMAIL` y
`SR_PASSWORD` para autenticarse en StockRápido.

```bash
python -m pip install playwright
python -m playwright install chromium
python juntosplus_sync_runner.py
```

Flujo:

```text
Login Juntos+ con OTP → captura Bearer/cid → catálogo completo paginado
→ normalización (card completo en raw) → POST /sync/connections/:id/push
→ mapeo e importación desde Configuración / Sincronizaciones
```
