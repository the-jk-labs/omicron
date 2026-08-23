# Backend: Deno + Hono + Fedify + Drizzle.
# --- deps: resolve node_modules from the lockfile ---------------------------
FROM node:24-alpine AS deps
WORKDIR /app
# Corepack pins pnpm to the version in package.json's "packageManager" field.
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- runtime: Deno with the installed dependencies --------------------------
FROM denoland/deno:2.9.4
WORKDIR /app

COPY deno.json package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY drizzle ./drizzle
# The bundled font the generated share card is drawn in (lib/ogCard.ts). Without
# it every card render fails and posts without an image share the brand tile —
# which is the failure this exists to fix, and a silent one.
COPY assets ./assets
# The one-off maintenance tasks (`deno task backfill:*`), so an operator can run
# one against the live database with `docker compose exec backend`. They are
# never started by the container itself.
COPY scripts ./scripts

# Pre-compile / cache modules, the scripts included — a backfill run inside a
# container should not have to reach the network for its dependencies.
RUN deno cache src/main.ts scripts/*.ts

# main.ts runs migrations on startup, then serves.
EXPOSE 8000
CMD ["deno", "run", "-A", "src/main.ts"]
