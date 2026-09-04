# Orchestration Engine container image.
#
# One container instance is scoped to exactly one sync_requests row — the
# ONLY tenant-scoped input is the SYNC_REQUEST_ID env var at runtime.
# Everything else (tenant, source/target provider, entities, credentials,
# mapping profiles) is loaded from Postgres from that one ID. See
# docs/LLD-orchestration-engine.md ("Containerization") for the full design
# and for the platform-secret env vars (DATABASE_URL, ENCRYPTION_MASTER_KEY)
# this image needs at runtime but never bakes in.
#
# Built and published by .github/workflows/build-orchestration-engine.yml
# on every push to the `dev` branch.

# ---- deps: installed in its own layer, cached unless package.json/lockfile change ----
FROM node:22-alpine AS deps
WORKDIR /app

# Root manifest + lockfile, plus each npm workspace's own package.json —
# npm needs these paths present to resolve the workspace tree, but not yet
# their source, so copying just this keeps the install layer cached across
# unrelated code changes.
COPY package.json package-lock.json ./
COPY packages/adapters/connectwise/package.json packages/adapters/connectwise/package.json
COPY packages/adapters/keka/package.json packages/adapters/keka/package.json

RUN npm ci --omit=dev

# ---- runtime: only what lib/orchestration/run.js actually needs ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node lib ./lib
# Real source for the two adapter workspaces — required because npm's
# workspace symlinks under node_modules/@ipaas/* point at these relative
# paths; without this, the symlinks above resolve to nothing.
COPY --chown=node:node packages/adapters ./packages/adapters

USER node

CMD ["node", "lib/orchestration/run.js"]
