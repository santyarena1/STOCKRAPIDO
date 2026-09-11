#!/bin/bash
# Doble-clic (macOS) para bajar Mis Comprobantes → Recibidos sin Afip SDK
# y cargarlos en StockRápido.
cd "$(dirname "$0")" || exit 1
cd sync-runner || { echo "No encuentro la carpeta sync-runner."; read -n1; exit 1; }

if [ ! -f .env ]; then
  echo "Falta sync-runner/.env"
  echo "Copiá .env.example a .env y completá:"
  echo "  SR_API, SR_EMAIL, SR_PASSWORD, AFIP_CUIT, AFIP_PASSWORD"
  read -n1
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Instalá Python 3 y volvé a intentar."
  read -n1
  exit 1
fi

python3 -m pip install -q playwright python-dotenv requests
python3 -m playwright install chromium

echo "Sincronizando facturas recibidas de ARCA… (ventana abierta por si pide CAPTCHA)"
AFIP_HEADLESS=0 python3 arca_recibidos_sync_runner.py --headed
echo ""
echo "Listo. Ya podés cerrar esta ventana."
read -n1 -s -r -p "Presioná cualquier tecla para cerrar."
echo
