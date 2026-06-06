# Sync Runner — Mondelez → StockRápido (producción)

Trae el catálogo de Mondelez con **tu precio real B2B** (login con teléfono) y lo empuja a la API desplegada de StockRápido.

El runner corre **en tu PC** (o una máquina con navegador). Vercel/Render no ejecutan Playwright, por eso los precios B2B los aporta este proceso local.

## Configuración (deploy)

1. Desplegá la API según [DEPLOY.md](../DEPLOY.md) (Render/Fly + Neon/Supabase).
2. En Vercel, configurá `NEXT_PUBLIC_API_URL` con la URL pública de la API.
3. Copiá `.env.example` → `.env` y completá:

| Variable | Valor |
|----------|--------|
| `SR_API` | URL pública de la API, ej. `https://stockrapido-api.onrender.com` |
| `SR_EMAIL` | Tu usuario StockRápido |
| `SR_PASSWORD` | Tu contraseña StockRápido |
| `MDLZ_PHONE` | Teléfono Mi Tienda Mondelez |
| `MDLZ_PASSWORD` | Contraseña Mondelez |

## Uso

```bash
python -m pip install playwright
python -m playwright install chromium
python mondelez_sync_runner.py
```

Podés agendarlo con **Task Scheduler** (Windows) o cron (Linux/macOS).

## Qué hace

1. Login en StockRápido → obtiene token contra `SR_API`.
2. Login en Mi Tienda Mondelez con tu teléfono.
3. Lee precios reales agregando productos al carrito autenticado.
4. `POST {SR_API}/sync/connections/:id/push` con catálogo + costos **por bulto**.
5. En la web (Sincronizaciones) importás a productos: los costos se convierten a **unitarios** para POS y listado.

## Flujo completo

```
Catálogo VTEX (servidor)     →  productos sin costo
Runner local (precio B2B)    →  costo por bulto en staging
Importar a productos         →  costo/venta c/u en tu catálogo
```
