# Aptible root Dockerfile — builds the Next.js app from apps/web/ and
# bundles the migration runner script + database/migrations/ so Aptible's
# before_release hook (.aptible.yml) can apply schema changes before
# traffic is routed to a new release.
FROM node:20-alpine AS base

# ---- Install & Build ----
FROM base AS builder
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json* ./
RUN npm ci
COPY apps/web/ .
RUN npm run build

# ---- Production ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# The migration runner uses MIGRATIONS_DIR to find SQL files at deploy
# time. /app/database/migrations is the path we copy them to below.
ENV MIGRATIONS_DIR=/app/database/migrations

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# standalone output includes only the dependencies the app needs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Migration runner: copied as plain ESM so no compile step is needed.
# pg is already in the standalone trace (used by lib/db.ts) and is
# resolvable from /app/node_modules at runtime.
COPY --from=builder /app/scripts ./scripts

# Migration SQL files. The .aptible.yml before_release hook runs
# `node /app/scripts/migrate.mjs` which reads from MIGRATIONS_DIR.
COPY database/migrations ./database/migrations

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
