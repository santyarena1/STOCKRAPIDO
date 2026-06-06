# Deploy STOCKRAPIDO — Vercel + Render + Neon/Supabase

Stack: Next.js (Vercel Hobby) · NestJS (Render free) · PostgreSQL (Neon o Supabase free)

---

## 0. Prerequisito: repo en GitHub

El repo tiene que estar en GitHub/GitLab para conectarlo a Vercel y Render.

---

## 1. Crear la base de datos PostgreSQL (Neon o Supabase)

### Opción A — Neon (recomendado, free tier generoso)

1. Registrarse en [neon.tech](https://neon.tech) → crear proyecto `stockrapido`.
2. En el dashboard copiar la **Connection string** (formato pooler):
   ```
   postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
3. Guardar ese valor como `DATABASE_URL` (se usa en el paso 2).

### Opción B — Supabase

1. Registrarse en [supabase.com](https://supabase.com) → nuevo proyecto.
2. **Project Settings → Database → Connection string → URI** (URI mode, no pooler).
   ```
   postgresql://postgres:TU_PASSWORD@db.xxxx.supabase.co:5432/postgres
   ```
3. Guardar como `DATABASE_URL`.

---

## 2. Generar la migración inicial y aplicarla (una sola vez)

Localmente, con la DB de Neon/Supabase como target:

```bash
# En la raíz del monorepo
cd apps/api

# Apuntar a la DB de producción
DATABASE_URL="<tu-connection-string>" npx prisma migrate dev --name init

# Verificar que las tablas se crearon
DATABASE_URL="<tu-connection-string>" npx prisma studio
```

> Si ya había carpeta `migrations/` generada con SQLite, borrala antes:
> `rm -rf prisma/migrations`

Luego commitear la carpeta `prisma/migrations/` generada:

```bash
git add apps/api/prisma/migrations
git commit -m "chore: add initial postgresql migration"
git push
```

---

## 3. Deploy de la API en Render

1. Ir a [render.com](https://render.com) → **New Web Service**.
2. Conectar el repo de GitHub.
3. Configurar:
   - **Root directory**: dejar vacío (usa el `render.yaml` de la raíz).
   - O si no usa el YAML automático:
     - **Build Command**: `npm install -g pnpm@9 && pnpm install && pnpm --filter api build`
     - **Start Command**: `cd apps/api && npx prisma migrate deploy && node dist/main`
   - **Instance type**: Free.
4. En la sección **Environment Variables** agregar:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | `<tu-connection-string>` |
   | `JWT_SECRET` | cadena aleatoria ≥32 chars |
   | `JWT_REFRESH_SECRET` | cadena aleatoria ≥32 chars (distinta) |
   | `WEB_URL` | `https://<tu-proyecto>.vercel.app` (se completa en paso 4) |
   | `NODE_ENV` | `production` |

   Opcional:
   | Key | Value |
   |-----|-------|
   | `WEB_URL` | `https://<tu-proyecto>.vercel.app` |
   | `PORT` | `4000` (Render lo inyecta solo, pero por si acaso) |

5. **Create Web Service** → esperar que el build termine.
6. Copiar la URL pública del servicio (ej. `https://stockrapido-api.onrender.com`).
7. Probar health check:
   ```
   curl https://stockrapido-api.onrender.com/health
   # → {"status":"ok"}
   ```

> **Tip Render free tier**: el servicio se duerme después de 15 min de inactividad. El primer request tarda ~30s en despertar.

---

## 4. Deploy del frontend en Vercel

1. Ir a [vercel.com](https://vercel.com) → **Add New Project** → importar el repo.
2. Configurar:
   - **Framework Preset**: Next.js (auto-detectado).
   - **Root Directory**: `apps/web`.
   - **Build Command**: `pnpm build` (o dejarlo en auto).
   - **Install Command**: dejar en auto (Vercel detecta pnpm).
3. En **Environment Variables**:

   | Key | Value |
   |-----|-------|
   | `NEXT_PUBLIC_API_URL` | `https://stockrapido-api.onrender.com` |

4. **Deploy** → esperar build.
5. Copiar la URL pública (ej. `https://stockrapido.vercel.app`).

---

## 5. Conectar API ↔ Frontend (CORS)

Volver a Render → **Environment** del servicio → actualizar (o agregar si no estaba):

```
WEB_URL = https://stockrapido.vercel.app
```

Hacer **Manual Deploy** (o push un commit) para que tome el nuevo valor.

---

## 6. Verificar que todo funciona

```bash
# 1. Health de la API
curl https://stockrapido-api.onrender.com/health

# 2. Login desde la web
# Abrir https://stockrapido.vercel.app/login
# Ingresar con las credenciales del seed (si corriste db:seed) o registrar un negocio nuevo

# 3. Verificar CORS (desde la consola del navegador en la URL de Vercel)
# No debe aparecer error "blocked by CORS policy"
```

---

## Variables de entorno — resumen

### `apps/api` (Render)

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `DATABASE_URL` | ✅ | Connection string de Neon/Supabase |
| `JWT_SECRET` | ✅ | Secret para tokens de acceso |
| `JWT_REFRESH_SECRET` | ✅ | Secret para refresh tokens |
| `WEB_URL` | ✅ | URL del frontend en Vercel |
| `NODE_ENV` | ✅ | `production` |
| `PORT` | — | Render lo inyecta automáticamente |
| `PUBLIC_API_URL` | opcional | URL pública de la API (para webhooks N8N) |
| `N8N_INVOICE_WEBHOOK_URL` | opcional | Webhook de N8N para facturas con IA |
| `AI_INVOICE_WEBHOOK_SECRET` | opcional | Secreto del callback de N8N |
| `WEB_URL` (para reset-password email) | recomendada | Igual que arriba |

### `apps/web` (Vercel)

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `NEXT_PUBLIC_API_URL` | ✅ | URL pública de la API en Render |
| `NEXT_PUBLIC_APP_URL` | ✅ | URL del frontend en Vercel (links públicos de figuritas, etc.) |

---

## Alternativa: Fly.io para la API

Si preferís Fly.io en lugar de Render (sin sleep en free tier con [fly.io/blog/free-postgres](https://fly.io/blog/free-postgres)):

```bash
# Instalar CLI
brew install flyctl

# Login y crear app
fly auth login
cd apps/api
fly launch --name stockrapido-api --no-deploy

# Setear secrets
fly secrets set DATABASE_URL="<connection-string>"
fly secrets set JWT_SECRET="<secret>"
fly secrets set JWT_REFRESH_SECRET="<secret>"
fly secrets set WEB_URL="https://stockrapido.vercel.app"
fly secrets set NODE_ENV="production"

# Deploy (usa el Dockerfile en apps/api/)
fly deploy
```

El `Dockerfile` en `apps/api/` ya está configurado para esto.

---

## Generar JWT secrets seguros

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Ejecutar dos veces: una para `JWT_SECRET` y otra para `JWT_REFRESH_SECRET`.
