#!/usr/bin/env bash
# Build de la API en Vercel (root = apps/api).
set -euo pipefail

export NODE_ENV=development

npm install --include=dev --legacy-peer-deps
npx prisma@6.19.2 generate
npx nest build
mkdir -p public
echo "StockRapido API" > public/index.html

# En preview a veces no hay DB alcanzable / no hace falta migrar.
# En production sí aplicamos migraciones.
if [ "${VERCEL_ENV:-}" = "production" ]; then
  npx prisma@6.19.2 migrate deploy
fi
