# Built in CI (a Next.js build doesn't fit in the VM's 1 GB). Two targets: web and worker (design file 74).
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM deps AS build
COPY . .
# Modules read these at import; build-only placeholders, the real values come from the VM's .env at runtime.
RUN DATABASE_URL=postgres://build APP_ORIGIN=http://build.invalid BETTER_AUTH_SECRET=build-only-placeholder-secret-000000 \
    npm run build && npm run build:worker

FROM node:22-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-slim AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "--max-old-space-size=176", "server.js"]

FROM node:22-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
USER node
CMD ["node", "--max-old-space-size=224", "dist/worker.js"]
