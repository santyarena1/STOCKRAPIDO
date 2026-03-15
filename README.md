# StockRápido - Sistema de gestión para kioscos

Sistema **SaaS multi-tenant** para kioscos en Argentina: POS rápido (3 clics o menos), roles, caja, productos, reportes. Monorepo con Next.js (App Router), NestJS, **SQLite** (local) / PostgreSQL (deploy), Prisma.

## Requisitos

- Node 20+
- pnpm (o `npx pnpm`)
- Para deploy: Docker (PostgreSQL, Mailhog). Para desarrollo local: solo SQLite (sin Docker).

## Inicio rápido (local con SQLite)

### 1. Instalar dependencias

```bash
npx pnpm install
```

### 2. Base de datos y datos de prueba (solo la primera vez)

```bash
cd apps/api && npx prisma db push && npx prisma db seed
cd ../..
```

La base queda en `apps/api/prisma/dev.db` (SQLite).

### 3. Levantar el proyecto

**Cerrá cualquier otra terminal que tenga `pnpm dev` corriendo.** Luego:

```bash
npx pnpm dev
```

- **Frontend:** http://localhost:3000  
- **API:** http://localhost:4002  

### 4. Iniciar sesión

- **Email:** `owner@demo.com`  
- **Contraseña:** `Demo123!`  

Más en `CREDENCIALES.md`. **Recuperar contraseña:** `/reset` → email (en dev el link se imprime en consola del API). **Cerrar sesión en todos los dispositivos:** en el sidebar, al pie.

## Módulos y rutas

| Ruta | Descripción |
|------|-------------|
| `/dashboard` | Resumen del negocio |
| `/pos` | Punto de venta (atajos F2, F4, F5, F6, ?, ESC, Enter, Ctrl+Backspace) |
| `/caja` | Apertura/cierre, ingresos y egresos (en construcción) |
| `/productos` | Listado, alta, edición, stock (en construcción) |
| `/compras` | Compras y sugerencias por stock bajo (en construcción) |
| `/proveedores` | Proveedores (en construcción) |
| `/clientes` | Clientes y fiado (en construcción) |
| `/reportes` | Ventas, top productos, export (en construcción) |
| `/config` | Configuración del negocio y POS (en construcción) |
| `/usuarios` | Usuarios y roles (en construcción) |
| `/billing` | Plan y facturación – MercadoPago preparado (en construcción) |

**Atajos del POS:** ver `POS_ATAJOS.md`.

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npx pnpm dev` | Frontend + API |
| `npx pnpm db:migrate` | Migraciones (cuando uses PostgreSQL) |
| `npx pnpm db:seed` | Cargar usuarios y productos demo |
| `npx pnpm db:studio` | Prisma Studio (ver DB) |

En local con SQLite usar `npx prisma db push` en `apps/api` para sincronizar el schema.

## Estructura

- **apps/api** – NestJS, Prisma, auth (JWT, refresh, reset password, logout todos), negocio, productos, ventas, ventas pausadas, throttling.
- **apps/web** – Next.js 15, login, registro, reset contraseña, layout con sidebar, POS con atajos, producto manual, descuento, ventas en espera.

## Deploy (Docker)

- `docker-compose.yml`: PostgreSQL, Redis (opcional), Mailhog.
- Variables: `DATABASE_URL` (Postgres), `JWT_SECRET`, `JWT_REFRESH_SECRET`, `WEB_URL` para emails.
- TODOs: integración ARCA/AFIP, MercadoPago billing, PWA/offline (IndexedDB).

Si ves **"Failed to fetch"**: comprobá que la API esté en marcha (`API running at http://localhost:4002`) y que solo corra una instancia de `npx pnpm dev`.
