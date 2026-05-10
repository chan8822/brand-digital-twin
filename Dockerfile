# syntax=docker/dockerfile:1.7

# ---- builder ---------------------------------------------------------------
FROM node:24-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Install all deps (including dev) so we can run the build.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY tsconfig.base.json tsconfig.json ./
COPY artifacts/api-server/package.json artifacts/api-server/
COPY lib lib
COPY artifacts/api-server artifacts/api-server

# Enforce pnpm install without frozen lockfile validation
RUN pnpm install --no-frozen-lockfile --ignore-scripts

# Build the api-server bundle (esbuild → dist/index.mjs)
RUN pnpm --filter @workspace/api-server run build

# Flatten the workspace package and create isolated production node_modules
# CHANGED: Added --legacy flag to support pnpm v10+ deploy behavior
RUN pnpm deploy --filter @workspace/api-server --prod /app/isolated --legacy

# ---- runner ---------------------------------------------------------------
FROM node:24-slim AS runner

ENV NODE_ENV=production
WORKDIR /app

# We no longer need pnpm or corepack in the runner stage! 
# We just copy the isolated node_modules directly from the builder.

COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY --from=builder /app/isolated/package.json ./package.json
COPY --from=builder /app/isolated/node_modules ./node_modules

# Drop privileges.
RUN groupadd --system --gid 1001 app \
 && useradd --system --uid 1001 --gid app --home /app app \
 && chown -R app:app /app
USER app

EXPOSE 8080

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
