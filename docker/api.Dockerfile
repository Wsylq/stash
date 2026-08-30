# ---------- builder ----------
FROM node:24-alpine AS builder
WORKDIR /app

# Deps first for layer caching
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --include-workspace-root

# Source
COPY packages/shared packages/shared
COPY apps/api apps/api

# Compile shared types + API to dist/
RUN npm run build --workspace @stash/shared && npm run build --workspace @stash/api

# ---------- runtime ----------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Lockfile-declared prod deps (workspace symlinks get created for @stash/shared)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --include-workspace-root --omit=dev

# Compiled code (shared needs its dist, which npm ci does not produce)
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/apps/api/dist apps/api/dist

ENV PORT=4000
ENV STASH_DATA_DIR=/data
EXPOSE 4000
VOLUME /data

RUN mkdir -p /data && chown node:node /data
USER node
CMD ["node", "apps/api/dist/index.js"]