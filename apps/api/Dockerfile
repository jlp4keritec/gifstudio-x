# syntax=docker/dockerfile:1.7
# ============================================================================
# GifStudio-X - API Dockerfile
# Adapte de gifstudio (publique) avec :
#   - @gifstudio-x/shared au lieu de @gifstudio/shared
#   - Ajout FFmpeg/ffprobe (probeVideo + thumbnails)
#   - Ajout Playwright/Chromium (crawler generic_browser)
# ============================================================================

# ============================================================================
# Stage 1 : deps
# ============================================================================
FROM node:22-alpine AS deps

RUN apk add --no-cache libc6-compat openssl python3 make g++ \
    && corepack enable \
    && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --filter "@gifstudio-x/shared..." --filter "api..."

# ============================================================================
# Stage 2 : builder (TypeScript -> JS + Prisma generate)
# ============================================================================
FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat openssl \
    && corepack enable \
    && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN cd apps/api && pnpm prisma generate
RUN cd apps/api && pnpm build

# ============================================================================
# Stage 3 : runner (Debian-based pour Playwright + FFmpeg)
# ============================================================================
FROM node:22-bookworm-slim AS runner

# Installer FFmpeg + dependances Playwright Chromium
# Note : on utilise Debian (bookworm) au lieu d'Alpine car Playwright est mal
# supporte sur Alpine (libc musl vs glibc).
RUN apt-get update && apt-get install -y --no-install-recommends \
        # Outils de base
        ca-certificates \
        tini \
        # FFmpeg pour probeVideo + thumbnails
        ffmpeg \
        # Dependances Playwright Chromium
        libnss3 \
        libnspr4 \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libcups2 \
        libdrm2 \
        libxkbcommon0 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        libgbm1 \
        libpango-1.0-0 \
        libcairo2 \
        libasound2 \
        libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system nodejs && useradd --system --gid nodejs --create-home nodejs

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
# Cache Playwright dans le home du user nodejs
ENV PLAYWRIGHT_BROWSERS_PATH=/home/nodejs/.cache/ms-playwright

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/node_modules ./apps/api/node_modules

# On copie le shared SOURCE puis on REMPLACE par le compile
COPY --from=builder --chown=nodejs:nodejs /app/packages/shared ./packages/shared
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist/packages/shared/src ./packages/shared/src

# Patch package.json shared pour pointer vers le JS compile
RUN echo '{"name":"@gifstudio-x/shared","version":"0.1.0","main":"./src/index.js","types":"./src/index.ts"}' > /app/packages/shared/package.json

COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/package.json ./apps/api/

# Installer le binaire Chromium pour Playwright
# Les deps systeme (libnss3, libcups2, etc.) sont deja installees au stage 2 via apt,
# donc pas besoin de --with-deps qui necessiterait root (et on est USER nodejs ici).
USER nodejs
WORKDIR /app/apps/api
RUN npx playwright install chromium
WORKDIR /app

# Storage
USER root
RUN mkdir -p /app/apps/api/storage/{videos,gifs,thumbnails,trash} \
    && chown -R nodejs:nodejs /app/apps/api/storage
USER nodejs

EXPOSE 4000

ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && node dist/apps/api/src/server.js"]
