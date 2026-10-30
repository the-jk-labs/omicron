# Backend: Deno + Hono + Fedify + Drizzle.
# Built from the repository root (see docker-compose.yml), so the API contract in packages/contract is in reach:
#   docker build -f apps/backend/Dockerfile .
# The image keeps the repository's layout, which the app's `link:../../packages/contract` dependency relies on.

# --- deps: resolve node_modules from the lockfiles ---------------------------
FROM node:24-alpine AS deps
# Corepack pins pnpm to the version in package.json's "packageManager" field.
RUN corepack enable
WORKDIR /app/packages/contract
COPY packages/contract/package.json packages/contract/pnpm-lock.yaml packages/contract/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
WORKDIR /app/apps/backend
COPY apps/backend/package.json apps/backend/pnpm-lock.yaml apps/backend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- runtime: Deno with the installed dependencies --------------------------
FROM denoland/deno:2.9.4

WORKDIR /app/packages/contract
COPY packages/contract/package.json ./
COPY packages/contract/src ./src
COPY --from=deps /app/packages/contract/node_modules ./node_modules

WORKDIR /app/apps/backend
COPY apps/backend/deno.json apps/backend/package.json ./
COPY --from=deps /app/apps/backend/node_modules ./node_modules
COPY apps/backend/src ./src
COPY apps/backend/drizzle ./drizzle
# The bundled font the generated share card is drawn in (lib/ogCard.ts). Without
# it every card render fails and posts without an image share the brand tile —
# which is the failure this exists to fix, and a silent one.
COPY apps/backend/assets ./assets
# The one-off maintenance tasks (`deno task backfill:*`), so an operator can run
# one against the live database with `docker compose exec backend`. They are
# never started by the container itself.
COPY apps/backend/scripts ./scripts

# Pre-compile / cache modules, the scripts included — a backfill run inside a
# container should not have to reach the network for its dependencies.
RUN deno cache src/main.ts scripts/*.ts

# main.ts runs migrations on startup, then serves.
EXPOSE 8000
CMD ["deno", "run", "-A", "src/main.ts"]
