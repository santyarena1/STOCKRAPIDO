# Deploy STOCKRAPIDO — Vercel + Neon

Stack: **Next.js** (Vercel) · **NestJS serverless** (Vercel) · **PostgreSQL** (Neon)

Dos proyectos en Vercel desde el mismo repo de GitHub:

| Proyecto Vercel | Root Directory | URL típica |
|-----------------|----------------|------------|
| API | `apps/api` | `https://stockrapido-api.vercel.app` |
| Web | `apps/web` | `https://stockrapido.vercel.app` |

---

## 1. Base de datos Neon

1. Crear proyecto en [neon.tech](https://neon.tech) → `stockrapido`.
2. Copiar la **connection string** con pooler (recomendado para serverless):
   ```
   postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```
3. Aplicar migraciones (una vez, desde tu PC o CI):
   ```bash
   cd apps/api
   DATABASE_URL="<neon-url>" npx prisma migrate deploy
   ```

---

## 2. Proyecto API en Vercel (`apps/api`)

1. [vercel.com](https://vercel.com) → **Add New Project** → repo de GitHub.
2. **Root Directory**: `apps/api`
3. Framework: Other (usa `vercel.json` del directorio).
4. **Environment Variables**:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | connection string de Neon |
   | `JWT_SECRET` | cadena aleatoria ≥32 chars |
   | `JWT_REFRESH_SECRET` | otra cadena distinta |
   | `WEB_URL` | URL del frontend, ej. `https://stockrapido.vercel.app` |
   | `NODE_ENV` | `production` |
   | `CRON_SECRET` | secreto para el cron de sync Mondelez |
   | `PUBLIC_API_URL` | URL de este proyecto API (ej. `https://stockrapido-api.vercel.app`) |

   Opcionales: `N8N_INVOICE_WEBHOOK_URL`, `AI_INVOICE_WEBHOOK_SECRET`

5. Deploy → probar:
   ```bash
   curl https://stockrapido-api.vercel.app/health
   # → {"status":"ok"}
   ```

El build ejecuta `prisma migrate deploy`, compila NestJS y expone la API como función serverless. El cron diario de catálogo Mondelez está en `vercel.json` (`GET /sync/cron` a las 06:00 UTC).

---

## 3. Proyecto Web en Vercel (`apps/web`)

1. **Add New Project** (segundo proyecto, mismo repo).
2. **Root Directory**: `apps/web`
3. Framework: Next.js (auto).
4. **Environment Variables**:

   | Key | Value |
   |-----|-------|
   | `NEXT_PUBLIC_API_URL` | URL del proyecto API, ej. `https://stockrapido-api.vercel.app` |
   | `NEXT_PUBLIC_APP_URL` | URL de este frontend, ej. `https://stockrapido.vercel.app` |

5. Deploy.

---

## 4. Conectar API ↔ Web (CORS)

En el proyecto **API** de Vercel, `WEB_URL` debe ser exactamente la URL del frontend (sin barra final). Redeploy si cambiás el dominio.

---

## 5. Sync runner Mondelez (local)

El precio B2B real lo trae el runner Python en tu PC (Playwright). En `sync-runner/.env`:

```
SR_API=https://stockrapido-api.vercel.app
SR_EMAIL=...
SR_PASSWORD=...
MDLZ_PHONE=...
MDLZ_PASSWORD=...
```

Ver [sync-runner/README.md](sync-runner/README.md).

---

## 6. Verificar

```bash
curl https://stockrapido-api.vercel.app/health
```

Abrí `https://stockrapido.vercel.app/login` — no debe haber errores CORS en la consola.

---

## Variables — resumen

### API (`apps/api` en Vercel)

| Variable | Requerida |
|----------|-----------|
| `DATABASE_URL` | ✅ Neon |
| `JWT_SECRET` | ✅ |
| `JWT_REFRESH_SECRET` | ✅ |
| `WEB_URL` | ✅ URL del frontend |
| `NODE_ENV` | ✅ `production` |
| `CRON_SECRET` | ✅ si usás auto-sync |
| `PUBLIC_API_URL` | recomendada (webhooks N8N) |

### Web (`apps/web` en Vercel)

| Variable | Requerida |
|----------|-----------|
| `NEXT_PUBLIC_API_URL` | ✅ URL del proyecto API |
| `NEXT_PUBLIC_APP_URL` | ✅ URL del frontend |

---

## JWT secrets

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Ejecutar dos veces (una por secret).
