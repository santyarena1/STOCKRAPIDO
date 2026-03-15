# Credenciales para iniciar sesión

El proyecto usa **SQLite** (archivo `apps/api/prisma/dev.db`) en local. No hace falta Docker.

## Owner (administrador)
- **Email:** `owner@demo.com`
- **Contraseña:** `Demo123!`

## Cajero
- **Email:** `cajero@demo.com`
- **Contraseña:** `Demo123!`

---

## Cómo usar

1. En la raíz: `npx pnpm dev`
2. Abrí **http://localhost:3000**
3. Iniciá sesión con **owner@demo.com** / **Demo123!**

**Olvidé mi contraseña:** en login, "Olvidé mi contraseña" → ingresá email. En desarrollo el link de reset se imprime en la consola del API.  
**Cerrar sesión en todos los dispositivos:** en el sidebar (layout de la app), al pie: "Cerrar sesión en todos los dispositivos".

La API corre en **http://localhost:4002**. Si ves "Failed to fetch", asegurate de que solo corra una instancia de `npx pnpm dev`.
