# Sync Runner — Mondelez → StockRápido

Trae el catálogo de Mondelez con **tu precio real B2B** (login con teléfono) y lo
empuja al backend de StockRápido (módulo de Sincronizaciones).

## Uso
1. `python -m pip install playwright && python -m playwright install chromium`
2. Copiá `.env.example` a `.env` y completá tus credenciales.
3. `python mondelez_sync_runner.py`

Se puede agendar (Task Scheduler de Windows / cron) para que corra solo.
El precio se lee agregando los productos a tu carrito autenticado (precio exacto que pagás).
