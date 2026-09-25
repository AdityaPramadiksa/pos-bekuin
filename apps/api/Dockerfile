# API Bekuin POS (NestJS + Prisma). Build dari root repo:
#   docker build -f apps/api/Dockerfile -t bekuin-api .
# Alpine sudah membawa libssl3 yang dibutuhkan Prisma, jadi tidak perlu apk add.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# ── Build: install workspace, build shared + api + seeder ──
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter @bekuin/api... --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @bekuin/shared build \
  && pnpm --filter @bekuin/api exec prisma generate \
  && pnpm --filter @bekuin/api build \
  && pnpm --filter @bekuin/api build:seed
# Paket produksi mandiri (tanpa devDependencies) di /out
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm --filter @bekuin/api deploy --legacy --prod --ignore-scripts /out \
  && cd /out && node node_modules/prisma/build/index.js generate

# ── Runtime ──
FROM node:22-alpine
ENV NODE_ENV=production PORT=3000 UPLOAD_DIR=/data/uploads TZ=UTC
WORKDIR /app
COPY --from=build --chown=node:node /out ./
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrasi database dijalankan otomatis setiap start (aman diulang); `exec` agar node menerima SIGTERM.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && exec node dist/main.js"]
