# CareerOS web app: static build served by nginx, which also proxies /api to the API container.
# Build from the repository root:  docker build -f apps/web/Dockerfile .
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace=apps/web --include-workspace-root --no-audit --no-fund
COPY tsconfig.base.json ./
COPY apps/web ./apps/web
# Same-origin "/api" by default, so cookies and CSP stay simple
ARG VITE_API_URL=/api
ARG VITE_SENTRY_DSN=
ARG VITE_APP_VERSION=dev
ENV VITE_API_URL=$VITE_API_URL VITE_SENTRY_DSN=$VITE_SENTRY_DSN VITE_APP_VERSION=$VITE_APP_VERSION
RUN npm run build --workspace=apps/web

FROM nginx:1.27-alpine AS runner
# Where nginx forwards /api requests (the compose service name by default)
ENV API_UPSTREAM=http://api:3001
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
