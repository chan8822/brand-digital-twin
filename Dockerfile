# syntax=docker/dockerfile:1.7

# ---- builder ---------------------------------------------------------------
FROM node:24-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production
RUN corepack enable

WORKDIR /app

# Install all deps (including dev) so we can run the build.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY tsconfig.base.json tsconfig.json ./
COPY artifacts/api-server/package.json artifacts/api-server/
COPY lib lib
COPY artifacts/api-server artifacts/api-server

# `preinstall` script enforces pnpm — corepack already provides it.
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build the api-server bundle (esbuild → dist/index.mjs)
RUN pnpm --filter @workspace/api-server run build

# ---- runner ---------------------------------------------------------------
FROM node:24-slim AS runner

ENV NODE_ENV=production
WORKDIR /app

# `sharp` is externalised by the api-server bundle, so we need its node
# binary at runtime. Install just the production deps for the api-server
# package — workspaces are flattened by pnpm deploy.
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY --from=builder /app/artifacts/api-server/package.json ./package.json

# Install only production deps for sharp & friends.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --no-frozen-lockfile --ignore-scripts

# Drop privileges.
RUN groupadd --system --gid 1001 app \
 && useradd  --system --uid 1001 --gid app --home /app app \
 && chown -R app:app /app
USER app

EXPOSE 8080

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
