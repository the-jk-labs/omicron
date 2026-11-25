# Frontend: SvelteKit (adapter-node). Multi-stage for a small runtime image.
FROM node:24.22.3-alpine3.24 AS build
WORKDIR /app
# Corepack pins pnpm to the version in package.json's "packageManager" field.
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm-workspace.yaml's patchedDependencies point here; install fails without it.
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Runtime dependencies only. adapter-node bundles devDependencies (Kit, Svelte)
# into build/ and imports only `dependencies` at runtime, so the build toolchain,
# browsers and test runners stay out of the image.
FROM node:24.22.3-alpine3.24 AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile --prod

FROM node:24.22.3-alpine3.24
WORKDIR /app
ENV NODE_ENV=production
ENV BODY_SIZE_LIMIT=50m
COPY --from=build /app/build ./build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/server.js ./
EXPOSE 3000
# Custom server wraps adapter-node's handler with on-the-fly compression for the
# dynamically rendered SSR HTML (precompress only covers static assets).
CMD ["node", "server.js"]
