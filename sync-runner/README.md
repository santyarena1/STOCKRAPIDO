# Sync Runner — proveedores → StockRápido (Vercel + Neon)

Trae catálogos y precios B2B de proveedores con sesión autenticada (Mondelez, Juntos+ y Tokin) y los empuja a la API en **Vercel**.

El runner corre **en tu PC** (Playwright). Vercel no ejecuta navegador, por eso los precios B2B los aporta este proceso local.

## Configuración

1. API y web desplegadas según [DEPLOY.md](../DEPLOY.md) (Vercel + Neon).
2. Copiá `.env.example` → `.env`:

| Variable | Valor |
|----------|--------|
| `SR_API` | `https://stockrapido-api.vercel.app` (tu proyecto API en Vercel) |
| `SR_EMAIL` | Usuario StockRápido |
| `SR_PASSWORD` | Contraseña StockRápido |

Las credenciales de cada proveedor se cargan en **Configuración → Proveedores**:
Mondelez usa teléfono y contraseña, Tokin usuario y contraseña, y Juntos+ solo
el número de cliente. Los runners las obtienen cifradas a través de tu sesión de
StockRápido y guardan automáticamente las cookies o tokens capturados.

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

Juntos+ usa el login de Coca-Cola sobre Microsoft Azure AD B2C. Cargá el número
de cliente y la contraseña en Configuración → Proveedores: el runner abre
Chromium, completa el acceso automáticamente y captura el Bearer y el `cid` sin
imprimir secretos. Si Microsoft solicita una verificación ocasional, el runner
deja el navegador abierto y continúa en modo interactivo.

No requiere variables adicionales: reutiliza `SR_API`, `SR_EMAIL` y
`SR_PASSWORD` para autenticarse en StockRápido.

```bash
python -m pip install playwright
python -m playwright install chromium
python juntosplus_sync_runner.py
```

Flujo:

```text
Login automático cliente + Azure B2C → captura Bearer/cid → catálogo completo paginado
→ normalización (card completo en raw) → POST /sync/connections/:id/push
→ mapeo e importación desde Configuración / Sincronizaciones
```

## Tokin — Arcor

Tokin se sincroniza mediante harvest del navegador porque su API interna entrega
la estructura completa durante la navegación. El runner abre
`https://tokintienda.com.ar/store/home`: iniciá sesión, entrá al catálogo y
presioná Enter. Luego recorre las vistas detectadas, dispara el lazy-load y
captura las respuestas de `/store/api/search` sin imprimir cookies ni tokens.

```bash
python -m pip install playwright
python -m playwright install chromium
python tokin_sync_runner.py
```

Cada producto conserva el payload original en `raw` y sus variantes UN/DI/BU,
códigos, multiplicadores, impuestos, precios y stock se envían a StockRápido.
