# syntax=docker/dockerfile:1
# The line above must be the file's very first line, before any other
# comment — Docker only recognizes a parser directive there. It enables
# BuildKit's --mount=type=secret, used below so the npm registry token
# never gets baked into an image layer.

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
# (repo root — GitHub Actions only discovers workflows there, not in a
# subfolder's own .github/workflows/) on every push to the `dev` branch.
#
# 2026-09-08 repo split: @ipaas/adapter-connectwise and @ipaas/adapter-keka
# now live in the sibling ipaas.providers folder and are declared as normal
# npm dependencies (see package.json), published to GitHub Packages'
# npm registry (npm.pkg.github.com) by .github/workflows/publish-providers.yml
# at the repo root. .npmrc (this folder) routes the @ipaas scope there.
#
# GitHub Packages requires auth to install a package, not just to publish
# one — npm ci below needs NODE_AUTH_TOKEN set to a token with
# read:packages. That token is never baked into an image layer: it's
# injected only for the duration of the npm ci RUN instruction via a
# BuildKit secret mount (--mount=type=secret), supplied by the CI
# workflow's `secrets:` input to docker/build-push-action. Building this
# image locally (e.g. `docker build`) needs the same secret passed via
# `docker buildx build --secret id=npm_token,env=NODE_AUTH_TOKEN` with
# NODE_AUTH_TOKEN set in your shell — a plain `docker build` without
# BuildKit secrets will fail to resolve @ipaas/* here.

# ---- deps: installed in its own layer, cached unless package.json/lockfile change ----
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=npm_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/npm_token)" npm ci --omit=dev

# ---- runtime: only what lib/orchestration/run.js actually needs ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node lib ./lib

USER node

CMD ["node", "lib/orchestration/run.js"]
