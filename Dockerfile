# DemandAI application image: Next.js standalone server plus the migration runner (Compose `migrate`,
# Kubernetes migrate Job). Multi-stage; the runtime stage holds no source, dev dependencies or build tools.
# Build:  docker build --build-arg APP_BUILD_VERSION=$(git rev-parse --short HEAD) -t demandai-app:<tag> .
ARG NODE_IMAGE=node:24.22.1-alpine3.23@sha256:0468540aa58203ff9e40c2aab3907c52644ab818af6176b1c70a026137dc92a2

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ARG APP_BUILD_VERSION=dev
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/drizzle \
    APP_BUILD_VERSION=${APP_BUILD_VERSION}
# Code stays owned by root and read-only for the app user; only Next's cache folder is writable.
RUN addgroup -S -g 10001 demandai && adduser -S -D -H -u 10001 -G demandai demandai \
 && mkdir -p /app/.next/cache && chown demandai:demandai /app/.next/cache
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/db/migrate.mjs /app/scripts/db/pg-ssl.mjs ./scripts/db/
COPY --from=build /app/scripts/users/create-admin.mjs ./scripts/users/
USER demandai
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "server.js"]
