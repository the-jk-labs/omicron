# Backend: Deno + Hono + Fedify + Drizzle.
FROM denoland/deno:2.9.4

WORKDIR /app

# Cache dependencies first for faster rebuilds on code-only changes.
COPY deno.json ./
COPY src ./src
COPY drizzle ./drizzle
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
