# Web Bekuin POS: build statis (Vite) lalu disajikan Caddy (HTTPS otomatis + proxy ke API).
#   docker build -f apps/web/Dockerfile -t bekuin-web .
FROM node:22-alpine AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter @bekuin/web... --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# Same-origin di belakang Caddy: API di /api/v1. VITE_PUBLIC_WEB_URL = alamat untuk QR meja.
ARG VITE_API_URL=/api/v1
ARG VITE_PUBLIC_WEB_URL=
ENV VITE_API_URL=$VITE_API_URL VITE_PUBLIC_WEB_URL=$VITE_PUBLIC_WEB_URL
RUN pnpm --filter @bekuin/shared build && pnpm --filter @bekuin/web build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
