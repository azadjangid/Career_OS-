FROM node:20-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app

FROM base AS deps
COPY package.json ./
COPY workers/package.json ./workers/
COPY prisma ./prisma/
RUN npm install --workspace=workers
RUN npx prisma generate

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/workers/node_modules ./workers/node_modules
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY . .
RUN npm run build --workspace=workers

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/workers/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

CMD ["node", "dist/index.js"]
