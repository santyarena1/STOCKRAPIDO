#!/bin/bash
# Doble-clic para sincronizar Tokin (Arcor) con StockRápido.
# Se abre un navegador, inicia sesión solo con tus credenciales guardadas,
# recorre el catálogo y sube todo a StockRápido.
cd "/Volumes/Lexar/STOCKRAPIDO" || { echo "No encuentro el proyecto en el pendrive."; read -n1; exit 1; }
echo "Sincronizando Tokin… seguí las indicaciones en la ventana."
sync-runner/.venv/bin/python sync-runner/tokin_sync_runner.py
echo ""
echo "Listo. Ya podés cerrar esta ventana."
read -n1 -s -r -p "Presioná cualquier tecla para cerrar."
