# ipaas.infra

Shared Postgres infrastructure for the iPaaS platform — the database container and the schema migrations that run against it. Split out of `ipaas.orchestrationengine` on 2026-09-08, alongside the earlier `ipaas.providers` split, for the same reason: the schema here isn't specific to the batch Orchestration Engine. The future real-time (webhook/queue) engine will read and write the same tables, so the database and its migrations live at this shared level rather than inside any one engine's repo.

## Layout

```
docker-compose.yml          local Postgres container (postgres:16-alpine)
docker/postgres/init/       first-run init scripts (pgcrypto extension)
migrations/                 node-pg-migrate migration files — the schema, in order
docs/migrations/README.md   full schema reference — every table, every column, why
docs/migrations/OPERATIONS.md  day-to-day commands, resets, troubleshooting
```

## Quick start

```powershell
cp .env.example .env    # fill in a real POSTGRES_PASSWORD
docker compose up -d
docker compose ps        # wait for healthy
npm install
npm run migrate:up
```

This is the only place migrations run from — `npm run migrate:up`/`down`/`create` live here now, not in `ipaas.orchestrationengine`. Any engine that needs the database (currently `ipaas.orchestrationengine`) keeps its own `DATABASE_URL` in its own `.env`, pointed at the same Postgres instance this folder starts — see that repo's `docs/DEVELOPER_SETUP.md` for the full end-to-end local setup across all three folders.

## Why this isn't just "the migrations folder in the engine repo"

Two reasons, not one:

- **Shared ownership.** The schema is a platform-level contract, not an Orchestration-Engine-specific one. Keeping it in its own place makes that explicit, and avoids the future real-time engine needing to depend on `ipaas.orchestrationengine` just to get the migrations.
- **Independent lifecycle.** Schema changes (a migration) and engine code changes (a `lib/` edit) are different kinds of change with different review/rollout concerns — separating them means a PR here is obviously "this changes the database," never bundled unnoticed into an engine code change.

Full schema reference: `docs/migrations/README.md`. Day-to-day commands and troubleshooting: `docs/migrations/OPERATIONS.md`.
