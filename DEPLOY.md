# Cómo subir STOCKRAPIDO online

Tu proyecto tiene **dos aplicaciones**:
- **Frontend (web)**: Next.js → se sirve en un puerto (ej. 3000).
- **Backend (api)**: NestJS + Prisma → se sirve en otro puerto (ej. 4002).

Hostinger **compartido** (hosting clásico) normalmente **no** sirve para esto porque no permite ejecutar Node.js ni dos procesos. Para subir el proyecto online tenés estas opciones.

---

## Opción 1: Servicios en la nube (recomendada si querés algo rápido)

### Frontend en Vercel (gratis para proyectos personales)

1. Subí el repo a **GitHub** (o GitLab).
2. Entrá a [vercel.com](https://vercel.com), vinculá el repo y configurá:
   - **Root Directory**: dejalo en la raíz del monorepo.
   - **Framework**: Next.js.
   - **Build Command**: `cd apps/web && pnpm install && pnpm build` (o el que use tu monorepo).
   - **Output Directory**: `apps/web/.next` (o el que indique Next.js).
   - **Install Command**: `pnpm install` (en la raíz).
3. Variables de entorno en Vercel:
   - `NEXT_PUBLIC_API_URL` = URL de tu API (ej. `https://tu-api.railway.app`).

### API en Railway o Render

**Railway** ([railway.app](https://railway.app)):

1. Conectá el mismo repo.
2. Configurá el servicio para la **API**:
   - Root: `apps/api` (o la carpeta donde está el NestJS).
   - Build: `pnpm install && pnpm run prisma:generate && pnpm build`.
   - Start: `node dist/main` (o `pnpm start` según tu `package.json`).
3. Variables de entorno: `DATABASE_URL`, `JWT_SECRET`, etc. En producción es mejor usar **PostgreSQL** (Railway te da una DB gratis) y cambiar en Prisma la conexión a Postgres en vez de SQLite.

**Render** ([render.com](https://render.com)): mismo concepto, creás un “Web Service” apuntando a la carpeta de la API y configurás build/start.

Con esto tenés: **Vercel** = frontend público, **Railway/Render** = API pública. El usuario entra a la URL de Vercel y la web llama a la URL de la API.

---

## Opción 2: VPS (Hostinger VPS, DigitalOcean, etc.)

Si contratás un **VPS** (Hostinger tiene VPS, también DigitalOcean, Vultr, etc.) podés tener frontend y API en el mismo servidor.

### Requisitos en el VPS

- Node.js 20+.
- pnpm (opcional, podés usar npm).
- Nginx (o Caddy) como proxy inverso.

### Pasos resumidos

1. **Clonar el repo** en el servidor:
   ```bash
   git clone https://github.com/tu-usuario/stockrapido.git
   cd stockrapido
   pnpm install
   ```

2. **Variables de entorno**  
   Creá `.env` en la raíz y/o en `apps/api` con:
   - `DATABASE_URL` (para Prisma; en producción mejor PostgreSQL).
   - `JWT_SECRET`.
   - Lo que use la API (puerto, etc.).

3. **Build**  
   En la raíz del monorepo:
   ```bash
   pnpm run build
   ```
   O por app:
   ```bash
   cd apps/api && pnpm run prisma:generate && pnpm build
   cd apps/web && pnpm build
   ```

4. **Ejecutar con PM2** (para que siga corriendo y se reinicie solo):
   ```bash
   npm install -g pm2
   pm2 start "node dist/main.js" --name api -c "cd apps/api"
   pm2 start "pnpm start" --name web -c "cd apps/web"
   pm2 save
   pm2 startup
   ```
   (Ajustá rutas según dónde esté `dist` y el `start` de cada app.)

5. **Nginx**  
   Configurá un sitio que:
   - Escuche en el puerto 80 (y 443 si usás SSL).
   - Haga proxy a `http://127.0.0.1:3000` para el frontend (Next.js).
   - Haga proxy a `http://127.0.0.1:4002` para la API (NestJS), por ejemplo bajo `/api`:
     ```nginx
     location /api {
         proxy_pass http://127.0.0.1:4002;
         proxy_http_version 1.1;
         proxy_set_header Host $host;
         proxy_set_header X-Real-IP $remote_addr;
         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
         proxy_set_header X-Forwarded-Proto $scheme;
     }
     location / {
         proxy_pass http://127.0.0.1:3000;
         proxy_http_version 1.1;
         proxy_set_header Upgrade $http_upgrade;
         proxy_set_header Connection 'upgrade';
         proxy_set_header Host $host;
         proxy_cache_bypass $http_upgrade;
     }
     ```

6. **Frontend**  
   En la web (Vercel o en el VPS) la variable `NEXT_PUBLIC_API_URL` debe ser la URL pública de la API (ej. `https://tudominio.com/api` si la API está bajo `/api`).

---

## Base de datos en producción

- **SQLite** (`dev.db`) sirve para desarrollo; en un servidor compartido o VPS puede fallar con muchos accesos y no es ideal para varios usuarios.
- En producción conviene usar **PostgreSQL** (o MySQL). En Railway/Render suelen ofrecer Postgres gratis. Cambiás en `apps/api/prisma/schema.prisma` el `provider` a `postgres` y `url` a `env("DATABASE_URL")`, corrés migraciones y listo.

---

## Resumen

| Dónde subir        | Frontend (Next.js) | API (NestJS) |
|--------------------|--------------------|--------------|
| **Rápido / gratis**| Vercel             | Railway o Render |
| **Todo en un servidor** | VPS (Hostinger VPS, DigitalOcean, etc.) con PM2 + Nginx |

Si me decís si preferís “todo en la nube” (Vercel + Railway) o “un solo servidor” (VPS), puedo detallarte solo esos pasos con los comandos exactos para tu repo.
