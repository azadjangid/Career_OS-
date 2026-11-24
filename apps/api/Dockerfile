# CareerOS API + background worker (same image, different command).
# Build from the repository root:  docker build -f apps/api/Dockerfile .
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# All dependencies, for compiling TypeScript
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=apps/api --include-workspace-root --no-audit --no-fund

FROM deps AS builder
COPY tsconfig.base.json ./
COPY prisma ./prisma
COPY apps/api ./apps/api
RUN npx prisma generate --schema=prisma/schema.prisma \
 && npm run build --workspace=apps/api

# Runtime dependencies only (prisma CLI is kept so the container can run migrations)
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY prisma ./prisma
RUN npm ci --omit=dev --workspace=apps/api --include-workspace-root --no-audit --no-fund \
 && npx prisma generate --schema=prisma/schema.prisma \
 && npm cache clean --force

FROM base AS runner
ENV NODE_ENV=production \
    LOG_FORMAT=json \
    STORAGE_LOCAL_PATH=/app/uploads \
    PORT=3001
COPY --from=prod-deps /app ./
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint
RUN chmod +x /usr/local/bin/api-entrypoint \
 && mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health/live >/dev/null || exit 1
ENTRYPOINT ["api-entrypoint"]
# "api" (default) runs migrations then the HTTP server; "worker" runs the background scheduler
CMD ["api"]
