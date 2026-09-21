# Developer Setup

Everything a new developer needs to get the platform running locally, end to end: Postgres, the schema, a working mapping configuration, and the Orchestration Engine actually syncing records against a mock ConnectWise/Keka server. No real provider accounts are needed for any of this.

This doc lives at `ipaas.platform/docs/setup/` — outside all three repos, since its content already spans them. Every command below assumes your shell's current directory is the parent folder containing all three repos (referred to as `ipaas.platform` throughout), unless a `cd` changes that; each section either continues from the previous one's ending directory or explicitly `cd`s to the one it needs.

Read this top to bottom once, in order — it's the only document you need to get from a fresh clone to a running, debuggable local setup. It's organized into three parts, one per repo, in the order you'd actually set them up: `ipaas.infra` (Part 1) is a hard dependency — Postgres has to exist before anything else can connect to it. `ipaas.orchestrationengine` (Part 2) is the engine itself; its `npm install` resolves the real, published `@rajkamal29/adapter-connectwise`/`adapter-keka` packages on its own, so you can get it fully running without touching `ipaas.providers` at all. `ipaas.providers` (Part 3) is optional and comes last — it's needed only if you want to debug into the adapters' actual source instead of stepping into the published package; Part 2, Step 4 covers the toggle and points forward to it. It references the other docs throughout (schema, engine internals, adapter verification status) purely as optional deeper reading, never as something you have to stop and go read to keep moving. Once you're done, "Where to go from here" at the bottom sequences what to read next — the demo walkthrough, real tenant onboarding, or day-to-day Postgres operations, depending on what you're doing.

## iPaaS API

For complete API local setup and intentionally manual CD deployment instructions, see [iPaaS API Developer Setup](../../ipaas.api/docs/API_DEVELOPER_SETUP.html).

Repository path: `ipaas.api/docs/API_DEVELOPER_SETUP.html`

## Prerequisites

- **Docker Desktop** — runs Postgres locally via `ipaas.infra/docker-compose.yml`. Nothing else in this stack is containerized yet in your day-to-day workflow (the Orchestration Engine has a `Dockerfile`, but you run it as a plain Node process locally — see Step 9).
- **Node.js 22.x** and npm (bundled with Node). The project doesn't pin an `engines` field yet, but the `Dockerfile` and everyone's local setup so far use Node 22 — install that, not an older LTS.
- **Git**.
- A local `psql` client is optional — `docker exec` into the Postgres container works fine without one (Step 7 below).

## Part 1 — ipaas.infra: Postgres and the schema

Everything else in this doc depends on this repo — Postgres and the schema have to exist before `ipaas.orchestrationengine` can connect to anything. Start here even if you never touch this repo again after today.

### 1. Clone and install

```powershell
git clone <infra-repo-url> ipaas.infra
cd ipaas.infra
npm install
```

Check this out as the first of three sibling folders — `ipaas.orchestrationengine` and `ipaas.providers` go next to it in Parts 2 and 3, not inside it. This `npm install` only pulls `node-pg-migrate` and `pg` as dev tooling; nothing to link here.

### 2. Configure environment

```powershell
cp .env.example .env    # from ipaas.infra
```

`ipaas.infra/.env`:

| Variable | What it's for | Notes |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Postgres container init (`docker-compose.yml`) | Change the password from the placeholder |
| `DATABASE_URL` | `node-pg-migrate` connection, when you run `npm run migrate:*` here | Must match the three vars above |

This file is gitignored — it never gets committed, and nothing in it should ever be pasted into a PR, a Slack message, or a CI log. `ipaas.orchestrationengine` has its own separate `.env` (Part 2, Step 5) describing the same Postgres instance from the app's side — the two need to stay in sync, see "Common early mistakes" at the bottom.

### 3. Start Postgres and run migrations

```powershell
docker compose up -d
docker compose ps          # confirm it's healthy
npm run migrate:up
```

This creates all 8 tables — `tenants`, `sync_requests`, `sync_entities`, `credentials`, `sync_state`, `canonical_entities`, `mapping_profiles`, `global_mapping_profiles`. Full command reference, troubleshooting, and reset instructions: `ipaas.infra/docs/migrations/OPERATIONS.md`. Schema details, why each table looks the way it does: `ipaas.infra/docs/migrations/README.md`.

## Part 2 — ipaas.orchestrationengine: the engine itself

Postgres and the schema from Part 1 are a hard dependency — nothing here connects to anything without them. `ipaas.providers` (Part 3) is not a dependency at all for this part — its own `npm install` resolves `@rajkamal29/adapter-connectwise`/`@rajkamal29/adapter-keka` from the published package, so you can finish this entire part, including Step 8's full sync run, without ever cloning `ipaas.providers`.

**One-time: authenticate npm against GitHub Packages.** `@rajkamal29/adapter-connectwise`/`@rajkamal29/adapter-keka` are private packages on `npm.pkg.github.com` (see `ipaas.orchestrationengine/.npmrc`) — installing them, not just publishing them, needs a token. Generate a GitHub PAT with `read:packages` scope (GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)), then set it as `NODE_AUTH_TOKEN` in your own environment — not `.env`, npm's config doesn't read that file:

```powershell
[System.Environment]::SetEnvironmentVariable('NODE_AUTH_TOKEN', '<your PAT>', 'User')
```

Restart your terminal (and VS Code, if it's open) afterward so the new variable is actually picked up. Do this once per machine.

### 4. Clone and install

```powershell
git clone <orchestration-engine-repo-url> ipaas.orchestrationengine
cd ipaas.orchestrationengine
npm install
```

Check out as a sibling of `ipaas.infra`. `npm install` resolves `@rajkamal29/adapter-connectwise`/`@rajkamal29/adapter-keka` for real now, from `npm.pkg.github.com` (using the token set above) — the actual published packages, like any other dependency in `package.json`, not a local workaround.

**Want to debug into the adapters' real source instead of the published package?** That's what Part 3 is for. Once `ipaas.providers` exists as a sibling folder and its own `npm link` has been run in each adapter (Part 3, Step 11):

```powershell
npm run providers:link
```

This overrides `node_modules/@rajkamal29/adapter-connectwise`/`adapter-keka` with symlinks to your local `ipaas.providers` checkout — the same mechanism Step 10 relies on for breakpoints in the adapters' actual files to hit. To go back to the published package:

```powershell
npm run providers:unlink
```

(Deliberately not plain `npm unlink` — see `scripts/unlink-providers.js`'s header comment for why: `npm unlink` inside a project defaults to also removing the package from `package.json`, which isn't what you want here.) Switch between the two freely, any time — neither command touches `package.json`, and re-running either is also how you recover after `rm -rf node_modules` in this repo, whichever mode you want to land back in.

### 5. Configure environment

```powershell
cp .env.example .env    # from ipaas.orchestrationengine
```

`ipaas.orchestrationengine/.env`:

| Variable | What it's for | Notes |
|---|---|---|
| `DATABASE_URL` | Every DB connection the app makes (`lib/db.js`) | Must match `ipaas.infra/.env`'s `POSTGRES_USER`/`PASSWORD`/`DB` (Part 1, Step 2) — same Postgres instance, two `.env` files pointing at it |
| `ENCRYPTION_MASTER_KEY` | Encrypts the `credentials` table (`lib/crypto.js`) | **Required**, no default. Generate one: `openssl rand -base64 32`. Changing this later makes every existing encrypted credential row undecryptable |
| `LOG_LEVEL` | `lib/logger.js` (pino) | `info` is fine day-to-day; `debug` shows per-page/per-record detail during troubleshooting |
| `NODE_ENV` | `lib/logger.js` | Leave unset locally — that's what gives you readable colorized logs (`pino-pretty`). Only set to `production` inside the container |

This file is gitignored too — same rule as `ipaas.infra/.env`.

### 6. Seed the platform-level mapping defaults

```powershell
node scripts/seed-global-mapping.js
```

This inserts the canonical `client` schema plus the default ConnectWise-inbound and Keka-outbound field mappings into `global_mapping_profiles`. Any tenant that doesn't define its own `mapping_profiles` override automatically inherits these — see `ipaas.orchestrationengine/docs/LLD-orchestration-engine.md` §5. Safe to re-run any time (it upserts).

### 7. Stand up a mock tenant and sync run

Nothing syncs without a tenant, a `sync_requests` row (a source→target pairing), and at least one `sync_entities` row. There's no UI yet, so this is a few `INSERT`s.

For a real tenant, use `docs/setup/TENANT_ONBOARDING.md` instead of this section — real credentials, not mock, so it's a different path, not a more detailed version of this one.

Open a psql session (back in `ipaas.infra`):

```powershell
cd ../ipaas.infra
docker compose exec postgres psql -U ipaas -d ipaas_platform
```

Then paste:

```sql
INSERT INTO tenants (name) VALUES ('MockTestTenant') RETURNING id AS tenant_id \gset
INSERT INTO sync_requests (tenant_id, source, target) VALUES (:'tenant_id', 'connectwise', 'keka') RETURNING id AS sync_request_id \gset
INSERT INTO sync_entities (sync_request_id, entity, sync_type, status) VALUES (:'sync_request_id', 'client', 'one_time', 'submitted') RETURNING id AS sync_entity_id \gset
```

`\q` to exit psql, then back to `ipaas.orchestrationengine` for the rest of this section:

```powershell
cd ../ipaas.orchestrationengine
```

Steps 7 (from here on)–9 all assume that directory.

The entrypoint discovers this tenant and entity directly from Postgres.

Then seed mock credentials pointing at the mock server (no real ConnectWise/Keka account needed):

```powershell
node scripts/seed-mock-credentials.js <tenant_id>
```

If you want this tenant to use its **own** mapping instead of the global default, also run `node scripts/seed-mock-mapping.js <tenant_id>` — otherwise skip it and it'll inherit what you seeded in Step 6.

### 8. Run the engine against the mock server

Start the mock server in its own terminal (leave it running):

```powershell
node scripts/mock-server.js
```

Then run the actual entrypoint — this is the real code, not a test harness:

```powershell
node lib/orchestration/run.js
```

You should see structured logs for the full pipeline for every configured sync entity: fetch → inbound mapping → canonical validation → outbound mapping → write → `sync_state` update, then the process exits — every invocation runs exactly one cycle and exits, regardless of `sync_type` (see `ipaas.orchestrationengine/docs/LLD-orchestration-engine.md` §7 for why). `ipaas.orchestrationengine/docs/DEMO-orchestration-engine.md` has the expected output in detail, including what a second run looks like (self-healing `failed`/`retry` reconciliation).

### 9. Building and running the container image

```powershell
docker build -t ipaas-orchestration-engine:local .
docker run --rm `
  -e DATABASE_URL=<same value as your .env, but with host.docker.internal instead of localhost> `
  -e ENCRYPTION_MASTER_KEY=<same as your .env> `
  ipaas-orchestration-engine:local
```

Note the `DATABASE_URL` swap — `localhost` inside the container refers to the container itself, not your host's Postgres. Use `host.docker.internal` (Docker Desktop on Windows/Mac resolves this automatically) instead. Full image design, what's baked in vs. passed at runtime, and the CI pipeline that publishes this automatically on push to `dev`: `ipaas.orchestrationengine/docs/LLD-orchestration-engine.md` §9.

### 10. Debugging in VS Code

A multi-root workspace file, `ipaas.platform.code-workspace`, sits at the root of `ipaas.platform`, next to the three repo folders (`ipaas.orchestrationengine/`, `ipaas.providers/`, `ipaas.infra/`) and this `docs/` folder. Open it in VS Code (`File > Open Workspace from File...`) instead of opening any one folder individually — you get all three repos in one window, and their debug configurations only resolve correctly this way (they reference each other by workspace-folder name).

It ships four launch configurations (Run and Debug panel, or `F5`):

| Configuration | What it runs | Notes |
|---|---|---|
| **Debug: run.js (all tenants/entities)** | The real entrypoint, `lib/orchestration/run.js` | Reads platform configuration from `.env`, discovers all tenants and sync entities from Postgres, and runs one sweep. |
| **Debug: test-orchestration-bootstrap.js** | The bootstrap + adapter-registry smoke test | Same `sync_entity_id` prompt. Useful for stepping through credential loading and adapter construction in isolation, without running a full cycle. |
| **Debug: test-run-cycle.js** | One full cycle + prints `sync_state` after | Same prompt. Good for stepping through `cycle.js`'s fetch → map → validate → write loop directly. |
| **Run: mock-server.js** | The mock ConnectWise/Keka server | No prompt — just starts it. Combine with the compound below instead of running it separately when you want breakpoints on both sides of a request. |

There's also a compound, **Debug: full cycle against mock server**, which starts the mock server and `run.js` together in one `F5` — handy for setting a breakpoint in `scripts/mock-server.js`'s route handler *and* in `cycle.js`'s fetch logic at the same time, to watch a request cross the boundary.

**Breakpoints in the adapters work too — if you've done Part 3 and run `npm run providers:link`.** With that done, `@rajkamal29/adapter-connectwise`/`@rajkamal29/adapter-keka` are symlinks into your local `ipaas.providers` checkout instead of the published package, so a breakpoint set in `ipaas.providers/connectwise/index.js` will hit when `run.js` calls into it through `node_modules/@rajkamal29/adapter-connectwise`. Skipped Part 3, or never ran `providers:link`? Breakpoints there won't hit at all — you're running the published package, which has no source for VS Code to map back to. If breakpoints show as unbound (hollow) instead of bound (solid red) after running `providers:link`, the symlink likely isn't in place — re-run the `npm link` steps from Part 3, Step 11 in `ipaas.providers/connectwise` and `ipaas.providers/keka`, then `npm run providers:link` again, and confirm with `ls node_modules/@rajkamal29` inside `ipaas.orchestrationengine`; you should see `adapter-connectwise` and `adapter-keka` listed as symlinks, not missing entirely.

All four configs point `envFile` at `ipaas.orchestrationengine`'s real `.env` (Part 2, Step 5) — nothing provider-specific needs to be duplicated into `launch.json` itself, and `ENCRYPTION_MASTER_KEY`/`DATABASE_URL` never end up hardcoded in a committed file. Postgres and the mock server both still need to be running as usual (Step 3, Step 8) before you launch any of these — the debug configs replace how you *start* `run.js`/the test scripts, not the rest of the setup.

## Part 3 — ipaas.providers: the ConnectWise/Keka adapters (optional)

**Optional, and last on purpose.** By this point (Part 2 done) the engine is already running end to end against the published `@rajkamal29/adapter-connectwise`/`adapter-keka` packages — you don't need this repo at all just to get the engine running. Do this part only if you want to set a breakpoint inside the adapters' actual source and have it hit when the engine calls into them (Part 2, Step 10), instead of stepping into the published package's compiled-in-place code.

### 11. Clone and install

```powershell
git clone <providers-repo-url> ipaas.providers
cd ipaas.providers/connectwise
npm install
npm link

cd ../keka
npm install
npm link
```

Check out as a sibling of `ipaas.infra`, not inside it. What's actually live-verified vs. still-guessed in each adapter is tracked in `ipaas.providers/docs/LLD-connector-auth-layer.md` — worth a skim before you rely on anything beyond the `client` entity. Re-run both `npm link` lines any time you `rm -rf node_modules` in either adapter folder. Once this is done, go back to Part 2, Step 4 and run `npm run providers:link` to actually wire these into the engine.

## Where to go from here

By this point you have the platform running locally, a test sync completed, and a working VS Code debug setup. Where to read next depends on what you're actually doing:

**Exploring the engine's behavior in more depth** (not just "it ran once") → `ipaas.orchestrationengine/docs/DEMO-orchestration-engine.md`. Same mock setup as Steps 7–8 above, but walks through the expected output step by step, including what a *second* run looks like — the self-healing `failed`/`retry` reconciliation, which a single run doesn't show.

**Onboarding a real tenant** — real ConnectWise/Keka credentials, not the mock server → `docs/setup/TENANT_ONBOARDING.md` (right next to this doc). It explicitly assumes everything in this document is already done, and picks up from there.

**Reference docs** — for deeper detail on any one part of what you just did; not required reading, dip in as needed:

| Topic | Doc |
|---|---|
| Full schema — every table, every column, why | `ipaas.infra/docs/migrations/README.md` |
| Postgres day-to-day commands, resets, troubleshooting | `ipaas.infra/docs/migrations/OPERATIONS.md` |
| Orchestration Engine internals — modules, execution flow, adapter contract, error taxonomy, mapping/canonical resolution, containerization | `ipaas.orchestrationengine/docs/LLD-orchestration-engine.md` |
| What's live-verified vs. still-guessed in the ConnectWise/Keka adapters | `ipaas.providers/docs/LLD-connector-auth-layer.md` |

## Common early mistakes

- **Running `npm run migrate:up` before Postgres is healthy** — `docker compose ps` first (from `ipaas.infra`); the healthcheck takes a few seconds after `up -d`.
- **Editing `ipaas.infra/.env`'s Postgres password after the container's already initialized** — Postgres only reads `POSTGRES_PASSWORD` on first init of an empty volume. If you change it later, `docker compose down -v && docker compose up -d` (from `ipaas.infra`) to reinitialize (this wipes local data — fine in dev, never do this against anything real).
- **Forgetting `ENCRYPTION_MASTER_KEY`** in `ipaas.orchestrationengine/.env` — `lib/crypto.js` throws immediately and clearly if it's missing or not a 32-byte base64 value, but it's an easy one to skip when copying `.env.example` quickly.
- **Letting the two `.env` files' Postgres values drift** — `ipaas.infra/.env` and `ipaas.orchestrationengine/.env` both describe the same Postgres instance from two sides (the container's init vs. the app's connection string). Change one, change the other.
- **Running `npm install` in `ipaas.orchestrationengine` before setting `NODE_AUTH_TOKEN`** — fails resolving `@rajkamal29/adapter-connectwise`/`adapter-keka` with a 401/404 from `npm.pkg.github.com`, not an obviously auth-related error. Set the token (Part 2 intro) and restart your terminal first.
- **Not realizing `providers:link`/`providers:unlink` silently do nothing if the other one was never run** — `providers:unlink` just deletes `node_modules/@rajkamal29/*` and reinstalls; if you were already on the published package, that's a harmless no-op reinstall, not a sign something's wrong.
