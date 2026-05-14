FROM node:20-alpine

RUN npm install -g pnpm@9

WORKDIR /repo

COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/

RUN pnpm install

COPY apps/api ./apps/api

RUN pnpm --filter api run build

WORKDIR /repo/apps/api

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
