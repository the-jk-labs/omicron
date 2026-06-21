# Backend: Deno + Hono + Fedify + Drizzle.
FROM denoland/deno:2.8.1

WORKDIR /app

# Cache dependencies first for faster rebuilds on code-only changes.
COPY deno.json ./
COPY src ./src
COPY drizzle ./drizzle

# Pre-compile / cache modules.
RUN deno cache src/main.ts

# main.ts runs migrations on startup, then serves.
EXPOSE 8000
CMD ["deno", "run", "-A", "src/main.ts"]
