# syntax=docker/dockerfile:1.7
# One image per app:  docker build --build-arg APP=api -t api .
ARG NODE_VERSION=24.20.0

FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /repo
# pnpm and turbo versions come from the root package.json (devEngines / devDependencies), so the
# image cannot drift from local tooling. Installed with npm; corepack is not used.
COPY package.json /tmp/root-package.json
RUN npm install -g \
      "pnpm@$(node -p "require('/tmp/root-package.json').devEngines.packageManager.version")" \
      "turbo@$(node -p "require('/tmp/root-package.json').devDependencies.turbo")" \
    && npm cache clean --force \
    && pnpm config set store-dir /pnpm/store

# 1) Prune the monorepo down to the target app and the workspace packages it depends on.
FROM base AS prune
ARG APP
COPY . .
RUN test -n "${APP}" || (echo "Missing --build-arg APP=<app>" && exit 1)
RUN turbo prune "${APP}" --docker

# 2) Install from manifests only (cached unless dependencies change), then build.
FROM base AS build
ARG APP
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN --mount=type=cache,id=turbo-cache,target=/repo/.turbo pnpm turbo run build --filter="${APP}"
# Production-only deps in a flat node_modules: the bundle inlines @repo/* source but imports
# their third-party deps (pino, bullmq, @opentelemetry/*, ...) by name, so they must be
# resolvable from the app root — the isolated pnpm layout would hide them.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter="${APP}" deploy --prod --config.node-linker=hoisted /out

# 3) Minimal runtime, non-root.
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
USER node
# Every app serves GET /health on $PORT (see apps/*/src/TODO.md).
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1
CMD ["node", "--import", "./dist/instrumentation.js", "dist/server.js"]
