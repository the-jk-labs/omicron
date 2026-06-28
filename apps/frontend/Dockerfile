# Frontend: SvelteKit (adapter-node). Multi-stage for a small runtime image.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/server.js ./
EXPOSE 3000
# Custom server wraps adapter-node's handler with on-the-fly compression for the
# dynamically rendered SSR HTML (precompress only covers static assets).
CMD ["node", "server.js"]
