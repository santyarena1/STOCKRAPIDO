#!/usr/bin/env bash
# Build de la API en Vercel (root = apps/api).
set -euo pipefail

export NODE_ENV=development

npm install --include=dev --legacy-peer-deps
npx prisma@6.19.2 generate
npx nest build
node -e "require('./dist/apps/api/src/vercel').default; console.log('vercel handler ok')"
mkdir -p public
echo "StockRapido API" > public/index.html

# Migraciones en production. No tumbar el deploy si Neon parpadea:
# el código nuevo tiene que salir igual; se puede reintentar migrate después.
if [ "${VERCEL_ENV:-}" = "production" ]; then
  npx prisma@6.19.2 migrate deploy || echo "WARN: prisma migrate deploy falló; el build continúa."
fi
