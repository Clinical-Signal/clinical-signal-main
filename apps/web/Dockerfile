FROM node:20-alpine AS base

# ---- Dependencies ----
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production && cp -R node_modules /prod_modules
RUN npm ci

# ---- Build ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Production ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# public/ may be empty but must exist for Next.js static asset serving
COPY --from=builder /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
