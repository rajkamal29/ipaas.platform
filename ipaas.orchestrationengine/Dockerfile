# Orchestration Engine container image (batch/polling engine — one_time
# and interval sync types only; real_time is a separate, not-yet-built
# engine).
#
# One container invocation is scoped to exactly one sync_entities row — the
# ONLY tenant-scoped input is the SYNC_ENTITY_ID env var at runtime.
# Everything else (tenant, source/target provider, credentials, mapping
# profiles) is loaded from Postgres from that one ID. Every invocation runs
# its one cycle once and exits — timing (when to invoke this again) is the
# Provisioning Engine / infra layer's job, not this image's. See
# docs/LLD-orchestration-engine.md ("Containerization") for the full design
# and for the platform-secret env vars (DATABASE_URL, ENCRYPTION_MASTER_KEY)
# this image needs at runtime but never bakes in.
#
# Built and published by .github/workflows/build-orchestration-engine.yml
# on every push to the `dev` branch.
#
# 2026-09-08 repo split: @ipaas/adapter-connectwise and @ipaas/adapter-keka
# now live in the separate ipaas.providers repo and are declared as normal
# npm dependencies (see package.json) instead of local workspace packages.
# BUILD IS CURRENTLY BROKEN: npm ci below needs to resolve those two
# packages from GitHub Packages' npm registry (npm.pkg.github.com), which
# they have not been published to yet — the repo split's registry
# connection is deliberately deferred (see docs/LLD-orchestration-engine.md
# and the repo-split backlog task). Publish both packages and add an
# .npmrc / NODE_AUTH_TOKEN step here (and in the CI workflow) before this
# image will build again.

# ---- deps: installed in its own layer, cached unless package.json/lockfile change ----
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime: only what lib/orchestration/run.js actually needs ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node lib ./lib

USER node

CMD ["node", "lib/orchestration/run.js"]
