# syntax=docker/dockerfile:1.7

# ── builder ──────────────────────────────────────────────────────────────────
FROM node:24-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Workspace manifests first so pnpm install is cached unless lockfile changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY tsconfig.base.json tsconfig.json ./

# tanmatra depends on lib/* workspace packages — copy manifests only for the
# install layer, then overwrite with full source for the build layer.
COPY artifacts/tanmatra/package.json artifacts/tanmatra/
COPY lib/db/package.json           lib/db/
COPY lib/api-zod/package.json      lib/api-zod/

RUN pnpm install --frozen-lockfile --ignore-scripts

# Full source for lib packages (compiled in-place by tsc or bundled by vite).
COPY lib lib
# Full source for tanmatra (includes src/, public/, vite.config.ts, etc.).
COPY artifacts/tanmatra artifacts/tanmatra

# Build → build/client/ (static assets) + build/server/ (SSR bundle).
RUN pnpm --filter @workspace/tanmatra run build

# Isolated production deployment: only prod deps, no workspace symlinks.
RUN pnpm deploy --filter @workspace/tanmatra --prod /app/isolated --ignore-scripts

# ── runner ────────────────────────────────────────────────────────────────────
FROM node:24-slim AS runner

ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

# SSR server bundle + static assets.
COPY --from=builder /app/artifacts/tanmatra/build ./build
# Prod node_modules (includes @react-router/serve binary).
COPY --from=builder /app/isolated/package.json    ./package.json
COPY --from=builder /app/isolated/node_modules    ./node_modules

RUN groupadd --system --gid 1001 app \
 && useradd  --system --uid 1001 --gid app --home /app app \
 && chown -R app:app /app
USER app

EXPOSE 8080

# react-router-serve streams SSR responses and serves build/client/ as static.
CMD ["./node_modules/.bin/react-router-serve", "./build/server/index.js"]
