# ---------- builder ----------
FROM node:24-alpine AS builder
WORKDIR /app

# Deps first for layer caching
ARG API_PROXY_URL=http://localhost:4000
ENV API_PROXY_URL=$API_PROXY_URL

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --include-workspace-root

# Source
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web

# Compile shared types, then build the Next.js PWA (produces .next/standalone)
RUN npm run build --workspace @stash/shared && npm run build --workspace @stash/web

# ---------- runtime ----------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Next.js standalone server + its traced node_modules
COPY --from=builder /app/apps/web/.next/standalone ./
# Static assets + public PWA assets (manifest, sw.js, icons)
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "apps/web/server.js"]