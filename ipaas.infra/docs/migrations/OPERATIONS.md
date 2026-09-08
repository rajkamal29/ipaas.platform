# Local Postgres Operations

Reference commands for standing up, inspecting, and resetting Postgres locally. Run all commands from the project root (where `docker-compose.yml` and `package.json` live), in PowerShell, unless noted otherwise.

Schema covered: `tenants`, `sync_requests`, `sync_entities`, `credentials`, `sync_state`, `canonical_entities`, `mapping_profiles`, `global_mapping_profiles` — see `docs/migrations/README.md` for what each table means and how they relate.

## 1. One-time environment setup

```powershell
cp .env.example .env
```

Then open `.env` and set a real `POSTGRES_PASSWORD`, updating the matching password in `DATABASE_URL` on the line below it so the two stay in sync. `.env` is gitignored — it never gets committed.

## 2. Start Postgres

```powershell
docker compose up -d
```

Starts the `ipaas-postgres` container in the background. On first run against an empty volume, the init script (`docker/postgres/init/01-create-extensions.sh` — creates the `pgcrypto` extension that `gen_random_uuid()` depends on) runs automatically.

**Check it came up healthy:**
```powershell
docker compose ps
```

**Watch the logs** (useful the first time, to confirm the init script ran without errors):
```powershell
docker compose logs -f postgres
```
(Ctrl+C to stop tailing — this doesn't stop the container.)

**Validate the connection actually works** (not just that the container is running):
```powershell
docker exec -it ipaas-postgres psql -U ipaas -d ipaas_platform -c "SELECT version();"
```

## 3. Install dependencies and run migrations

```powershell
npm install
npm run migrate:up
```

`npm run migrate:up` runs `node-pg-migrate up`, which connects using `DATABASE_URL` from `.env` and applies every migration in `migrations/` that hasn't run yet. It tracks what's already applied in its own `pgmigrations` table, so re-running this later only applies new migrations.

**To roll back the last migration** (if you need to undo a schema change):
```powershell
npm run migrate:down
```

**Important:** `migrations/` must contain *only* migration files — `node-pg-migrate` tries to parse every file in that folder for a numeric timestamp prefix. Anything else (a stray `README.md`, notes, etc.) breaks the runner with `Cannot determine numeric prefix for "<file>"`. Keep docs like `LLD-core-schema.md` in `docs/` instead.

## 4. Connect to Postgres

**Via the container (no local psql install needed):**
```powershell
docker exec -it ipaas-postgres psql -U ipaas -d ipaas_platform
```
(swap `ipaas` for your actual `POSTGRES_USER` if you changed it in `.env`)

**Via a local psql client, if installed:**
```powershell
psql "postgresql://ipaas:<your-password>@localhost:5432/ipaas_platform"
```

## 5. Inspect the schema (inside psql)

| Command | Purpose |
|---|---|
| `\l` | List databases — confirms `ipaas_platform` exists |
| `\dt` | List all tables — should show `tenants`, `sync_requests`, `sync_entities`, `credentials`, `sync_state`, `canonical_entities`, `mapping_profiles`, `global_mapping_profiles`, plus `pgmigrations` |
| `\d sync_entities` | Describe a table's columns and constraints |
| `\di` | List indexes |
| `\x` | Toggle expanded (vertical) row display — helpful for wide columns |
| `\q` | Exit |

## 6. View records

```sql
SELECT * FROM tenants;
SELECT id, tenant_id, source, target, created_at FROM sync_requests;
SELECT id, sync_request_id, entity, sync_type, status FROM sync_entities;
SELECT id, tenant_id, provider, created_at, updated_at FROM credentials;  -- avoid SELECT *, encrypted_payload/iv/auth_tag are raw bytea
```

## 7. Get a tenant's ID

No seed script creates a tenant automatically — a tenant is a row you insert directly (or, later, via the API layer once it exists):

```sql
INSERT INTO tenants (name) VALUES ('OculusIT') RETURNING id;
```

or, if it already exists:

```sql
SELECT id FROM tenants WHERE name = 'OculusIT';
```

The Orchestration Engine itself doesn't take a tenant ID directly — it takes a `SYNC_ENTITY_ID` (see `ipaas.orchestrationengine/lib/orchestration/run.js`), scoped to a single `sync_entities` row (one entity within one tenant's source→target pairing — see `ipaas.orchestrationengine/docs/LLD-orchestration-engine.md` §1 for why it's entity-scoped, not request-scoped). The full sequence for creating a tenant, a `sync_requests` row, and its `sync_entities` rows together is in `docs/setup/DEVELOPER_SETUP.md` (at the `ipaas.platform` root) and `ipaas.orchestrationengine/docs/DEMO-orchestration-engine.md` — this section is just for when you need a tenant's raw `id`, e.g. to seed credentials or mapping profiles against it.

**Onboarding a real tenant** (not a demo/dev one) — see `docs/setup/TENANT_ONBOARDING.md` (at the `ipaas.platform` root) for the full manual runbook, including real credential seeding via `ipaas.orchestrationengine/scripts/seed-credentials.js`.

## 8. Stop / reset

**Stop the container, keep the data:**
```powershell
docker compose down
```

**Stop and wipe all data** (genuinely fresh start — drops the volume, so all tables and migration history are gone; you'll need to re-run `npm run migrate:up` afterward):
```powershell
docker compose down -v
```

**Gotcha to know about:** `docker compose up -d` reattaches to an *existing* named volume (`ipaas_postgres_data`) if one is already on your machine — it does not silently give you a fresh database just because you deleted migration files or restarted the container. If you want a truly clean database, you need `down -v`, not just `up -d` again.

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `The DATABASE_URL environment variable is not set or incomplete connection parameters are provided.` | `node-pg-migrate` only loads `.env` automatically if the `dotenv` package is installed | Run `npm install` — `dotenv` is already in `package.json` |
| `connect ECONNREFUSED 127.0.0.1:5432` | Postgres container isn't running yet, or hasn't finished its healthcheck | Run `docker compose ps` to check status; wait a few seconds after `docker compose up -d` before running migrations |
| `password authentication failed` | `.env` was edited *after* the container and volume were first created — Postgres only reads `POSTGRES_PASSWORD` on first initialization of an empty data directory | `docker compose down -v` then `docker compose up -d` again to reinitialize with the current `.env` values |
| `Cannot determine numeric prefix for "<file>"` | A non-migration file (e.g. a `README.md`) is sitting inside `migrations/` | Move it out — `node-pg-migrate` treats every file in that folder as a migration |
| `Not run migration X is preceding already run migration Y` | The Postgres volume already has an older migration history in it (e.g. left over from a previous version of the schema) that doesn't match what's on disk now | `docker compose down -v && docker compose up -d` to start from a genuinely empty volume, then `npm run migrate:up` |
| Table missing after `npm run migrate:up` | Migration didn't actually run, or ran against the wrong database | Check `SELECT * FROM pgmigrations;` inside psql to see which migrations have been recorded as applied |
