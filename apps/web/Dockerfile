# syntax=docker/dockerfile:1.7
# ============================================================================
# GifStudio-X - Web Dockerfile
# Identique a la version publique sauf @gifstudio-x/shared
# ============================================================================

# Stage 1 : deps
FROM node:22-alpine AS deps

RUN apk add --no-cache libc6-compat \
    && corepack enable \
    && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --filter "@gifstudio-x/shared..." --filter "web..."

# Stage 2 : builder
FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat \
    && corepack enable \
    && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

RUN mkdir -p apps/web/public

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter web build

# Stage 3 : runner
FROM node:22-alpine AS runner

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs \
    && apk add --no-cache libc6-compat tini

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# Output standalone Next.js
COPY --from=builder --chown=nodejs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nodejs:nodejs /app/apps/web/public ./apps/web/public

USER nodejs

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
