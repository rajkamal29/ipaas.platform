# Developer Setup

Everything a new developer needs to get the platform running locally, end to end: Postgres, the schema, a working mapping configuration, and the Orchestration Engine actually syncing records against a mock ConnectWise/Keka server. No real provider accounts are needed for any of this.

Read this top to bottom once; after that, `docs/migrations/OPERATIONS.md` and `docs/DEMO-orchestration-engine.md` are the two you'll come back to.

## Prerequisites

- **Docker Desktop** — runs Postgres locally via `docker-compose.yml`. Nothing else in this stack is containerized yet in your day-to-day workflow (the Orchestration Engine has a `Dockerfile`, but you run it as a plain Node process locally — see §7).
- **Node.js 22.x** and npm (bundled with Node). The project doesn't pin an `engines` field yet, but the `Dockerfile` and everyone's local setup so far use Node 22 — install that, not an older LTS.
- **Git**.
- A local `psql` client is optional — `docker exec` into the Postgres container works fine without one (§4 below).

## 1. Clone and install

```powershell
git clone <repo-url>
cd ipaas.platform
npm install
```

`npm install` installs the root `package.json` dependencies plus both npm workspaces under `packages/adapters/*` (`@ipaas/adapter-connectwise`, `@ipaas/adapter-keka`) in one pass — you don't need to `cd` into them separately.

## 2. Configure environment

```powershell
cp .env.example .env
```

Then edit `.env`:

| Variable | What it's for | Notes |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Postgres container init | Change the password from the placeholder; keep `DATABASE_URL` below in sync with it |
| `DATABASE_URL` | Every DB connection (`lib/db.js`, migrations) | Must match the three vars above |
| `ENCRYPTION_MASTER_KEY` | Encrypts the `credentials` table (`lib/crypto.js`) | **Required**, no default. Generate one: `openssl rand -base64 32`. Changing this later makes every existing encrypted credential row undecryptable |
| `LOG_LEVEL` | `lib/logger.js` (pino) | `info` is fine day-to-day; `debug` shows per-page/per-record detail during troubleshooting |
| `NODE_ENV` | `lib/logger.js` | Leave unset locally — that's what gives you readable colorized logs (`pino-pretty`). Only set to `production` inside the container |
| `SYNC_REQUEST_ID` | `lib/orchestration/run.js` | Not a fixed setting — this is which sync run you're starting. Leave blank in `.env`; set it per-run (§6) |

`.env` is gitignored — it never gets committed, and nothing in it should ever be pasted into a PR, a Slack message, or a CI log.

## 3. Start Postgres and run migrations

```powershell
docker compose up -d
docker compose ps          # confirm it's healthy
npm run migrate:up
```

This creates all 8 tables — `tenants`, `sync_requests`, `sync_entities`, `credentials`, `sync_state`, `canonical_entities`, `mapping_profiles`, `global_mapping_profiles`. Full command reference, troubleshooting, and reset instructions: `docs/migrations/OPERATIONS.md`. Schema details, why each table looks the way it does: `docs/migrations/README.md`.

## 4. Seed the platform-level mapping defaults

```powershell
node scripts/seed-global-mapping.js
```

This inserts the canonical `client` schema plus the default ConnectWise-inbound and Keka-outbound field mappings into `global_mapping_profiles`. Any tenant that doesn't define its own `mapping_profiles` override automatically inherits these — see `docs/LLD-orchestration-engine.md` §5. Safe to re-run any time (it upserts).

## 5. Stand up a tenant and a mock sync run

Nothing syncs without a tenant, a `sync_requests` row (a source→target pairing), and at least one `sync_entities` row. There's no UI yet, so this is a few `INSERT`s — see `docs/DEMO-orchestration-engine.md` for the exact, copy-pasteable SQL block and the tenant/`sync_request` IDs already in common use for demos. In short:

```sql
INSERT INTO tenants (name) VALUES ('YourTestTenant') RETURNING id AS tenant_id \gset
INSERT INTO sync_requests (tenant_id, source, target) VALUES (:'tenant_id', 'connectwise', 'keka') RETURNING id AS sync_request_id \gset
INSERT INTO sync_entities (sync_request_id, entity, sync_type, status) VALUES (:'sync_request_id', 'client', 'one_time', 'submitted');
```

Then seed fake credentials pointing at the mock server (no real ConnectWise/Keka account needed):

```powershell
node scripts/seed-mock-credentials.js <tenant_id>
```

If you want this tenant to use its **own** mapping instead of the global default, also run `node scripts/seed-mock-mapping.js <tenant_id>` — otherwise skip it and it'll inherit what you seeded in §4.

## 6. Run the engine

Start the mock server in its own terminal (leave it running):

```powershell
node scripts/mock-server.js
```

Then run the actual entrypoint — this is the real code, not a test harness:

```powershell
$env:SYNC_REQUEST_ID="<sync_request_id>"; node lib/orchestration/run.js
```

You should see structured logs for the full pipeline: fetch → inbound mapping → canonical validation → outbound mapping → write → `sync_state` update. `docs/DEMO-orchestration-engine.md` has the expected output in detail, including what a second run looks like (self-healing `failed`/`retry` reconciliation).

## 7. Building and running the container image

```powershell
docker build -t ipaas-orchestration-engine:local .
docker run --rm `
  -e SYNC_REQUEST_ID=<sync_request_id> `
  -e DATABASE_URL=<same value as your .env, but with host.docker.internal instead of localhost> `
  -e ENCRYPTION_MASTER_KEY=<same as your .env> `
  ipaas-orchestration-engine:local
```

Note the `DATABASE_URL` swap — `localhost` inside the container refers to the container itself, not your host's Postgres. Use `host.docker.internal` (Docker Desktop on Windows/Mac resolves this automatically) instead. Full image design, what's baked in vs. passed at runtime, and the CI pipeline that publishes this automatically on push to `dev`: `docs/LLD-orchestration-engine.md` §9.

## Where things live, and what to read next

| Topic | Doc |
|---|---|
| Full schema — every table, every column, why | `docs/migrations/README.md` |
| Postgres day-to-day commands, resets, troubleshooting | `docs/migrations/OPERATIONS.md` |
| Orchestration Engine internals — modules, execution flow, adapter contract, error taxonomy, mapping/canonical resolution, containerization | `docs/LLD-orchestration-engine.md` |
| What's live-verified vs. still-guessed in the ConnectWise/Keka adapters | `docs/LLD-connector-auth-layer.md` |
| Full repeatable demo walkthrough with expected output | `docs/DEMO-orchestration-engine.md` |

## Common early mistakes

- **Running `npm run migrate:up` before Postgres is healthy** — `docker compose ps` first; the healthcheck takes a few seconds after `up -d`.
- **Editing `.env`'s Postgres password after the container's already initialized** — Postgres only reads `POSTGRES_PASSWORD` on first init of an empty volume. If you change it later, `docker compose down -v && docker compose up -d` to reinitialize (this wipes local data — fine in dev, never do this against anything real).
- **Forgetting `ENCRYPTION_MASTER_KEY`** — `lib/crypto.js` throws immediately and clearly if it's missing or not a 32-byte base64 value, but it's an easy one to skip when copying `.env.example` quickly.
- **Expecting `SYNC_REQUEST_ID` to live in `.env` permanently** — it doesn't represent a fixed setting, it's "which run am I starting right now." Set it inline per command.
