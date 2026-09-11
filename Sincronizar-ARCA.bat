@echo off
chcp 65001 >nul
cd /d "%~dp0sync-runner" || (
  echo No encuentro la carpeta sync-runner.
  pause
  exit /b 1
)

if not exist .env (
  echo Falta sync-runner\.env
  echo Copia .env.example a .env y completa:
  echo   SR_API, SR_EMAIL, SR_PASSWORD, AFIP_CUIT, AFIP_PASSWORD
  pause
  exit /b 1
)

where python >nul 2>&1 || (
  echo Instala Python 3 desde https://www.python.org/downloads/
  echo Marca "Add python.exe to PATH" en el instalador.
  pause
  exit /b 1
)

python -m pip install -q playwright python-dotenv requests
python -m playwright install chromium

echo Sincronizando facturas recibidas de ARCA...
set AFIP_HEADLESS=0
python arca_recibidos_sync_runner.py --headed
echo.
echo Listo.
pause
