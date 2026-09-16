# Orchestration Engine — Technical Reference

Audience: engineers implementing, extending, or debugging the Orchestration Engine. This document describes the system as it actually exists in code today, not as originally planned — where an earlier design was corrected or diverged, that's called out explicitly.

Related docs: `ipaas.infra/docs/migrations/README.md` (full schema reference), `docs/LLD-connector-auth-layer.md` (what's live-verified vs. guessed per provider, now in the `ipaas.providers` repo), `docs/DEMO-orchestration-engine.md` (runnable walkthrough against a mock server).

**Repo split (2026-09-08).** This engine's code now lives in its own repo, `ipaas.orchestrationengine`, separate from the provider adapters (`ipaas.providers` — `@rajkamal29/adapter-connectwise` and `@rajkamal29/adapter-keka`, each an independently publishable npm package, see that repo's `README.md`) and from Postgres itself (`ipaas.infra` — the container, init scripts, and schema migrations, pulled out because the database is a platform-level concern any future engine will also depend on, not something specific to this one). All three repos exist side by side today only as sibling folders inside one working tree; the actual GitHub-repo split and package-registry connection (`npm.pkg.github.com`) are deliberately deferred — see §9's Docker build note. Locally, the adapters resolve via `npm link`, not a published package.

---

## 1. Scope and orchestration model

**Redesigned 2026-09-08.** This is the batch/polling engine — `one_time` and `interval` sync types only. `real_time` is explicitly out of scope, handled by a separate, not-yet-built webhook/queue-driven engine (see the end of this section).

One process **invocation** performs a complete database-driven sweep. `run.js` loads every row from `tenants`, loads every corresponding `sync_entities` row through its parent `sync_requests` row, and calls the existing per-entity run policy once for each result. Tenants with no sync entities are logged and skipped; they do not stop later tenants from being processed.

The entrypoint no longer accepts `SYNC_ENTITY_ID` or any other tenant-scoped identifier from the environment. The entity ID used by logging, `sync_state`, terminal status updates, and the cycle itself is `sync_entities.id` returned by Postgres. The join to `sync_requests` supplies the tenant plus source/target providers, while credentials and mapping profiles continue to be resolved through their existing tenant-aware helpers.

The process exits after all tenants and their entities have been visited. There is still no in-process timer or long-lived loop: deciding when to start another full sweep belongs to the deployment/scheduling layer. `schedule.js` remains a per-entity policy module despite its historical name.

`real_time` entities should never be routed to this engine at all — infra routing them here is a mistake, and `schedule.js` throws rather than silently tolerating it (see §7). Event-driven sync belongs to a separate engine, designed around a long-lived webhook receiver or queue consumer instead of a run-once-and-exit container — a fundamentally different execution model that doesn't fit this one. That engine's design hasn't started.

## 2. Module map

```
lib/orchestration/
  run.js              entrypoint — what the container actually executes
  bootstrap.js         loads all tenants and per-tenant sync entities joined to
                        their parent sync_requests rows; shared mapping/query path
  adapter-registry.js  provider name -> adapter class lookup; loads credentials
                        and injects them into the adapter constructor (see §4)
  schedule.js           run-once policy: decides sync_entities.status per sync_type
  cycle.js              the actual fetch -> map -> validate -> write pipeline
  sync-state.js         sync_state read/write
  sync-entities.js      sync_entities.status write-back

lib/mapping/
  engine.js             applyMapping / validateCanonical
  profiles.js           loads mapping_profiles / canonical_entities rows

lib/
  credentials.js        loadCredentials / saveCredentials (AES-256-GCM at rest)
  db.js                 pg Pool
  logger.js             pino, with .child() scoping used throughout
```

Provider adapters (`ConnectWiseAdapter`, `KekaAdapter`) are **no longer part of this repo**. They live in the sibling `ipaas.providers` repo as `@rajkamal29/adapter-connectwise` and `@rajkamal29/adapter-keka`, declared as normal npm dependencies in `package.json` and resolved locally via `npm link` (see the repo-split note above). `adapter-registry.js` is the only file in this repo that touches them.

## 3. Execution flow

```
run.js
  -> loadAllTenants()
  -> for each tenant
       -> loadSyncEntityRunsForTenant(tenant.id) [bootstrap.js — JOIN through sync_requests]
       -> no rows: log and continue
       -> for each database row
            -> createAdapter(source, tenantId, log) [loads tenant credentials]
            -> createAdapter(target, tenantId, log)
            -> runEntityOnce({ id: syncEntityId, ... }, ...) [schedule.js]
                 one_time  -> runCycle() -> status = completed|failed
                 interval  -> runCycle(); lifecycle status unchanged
                 real_time -> throws — this engine does not handle it
  -> pool.end(); process.exit(0)   — unconditional, every invocation exits
```

There is no branch on "stay alive". A process invocation runs one cycle for every entity returned during the sweep and then exits. A later invocation starts a fresh database read, so newly added tenants and entities are discovered automatically.

`runCycle` (once per entity in the current sweep) does the actual work:

```
loadOrCreateSyncState(entityId)
loadActiveMappingProfile(tenant, source, entity, 'inbound')
loadActiveMappingProfile(tenant, target, entity, 'outbound')
loadCanonicalSchema(entity)
  -> fetchAllPages(sourceAdapter, entity, cursor.modifiedSince)      [delta]
  -> sourceAdapter.fetchByIds(entity, failed[] + retry[] ids)         [reconciliation]
  -> merge (delta wins on ID collision)
  -> for each record:
       applyMapping(inbound) -> validateCanonical -> applyMapping(outbound) -> targetAdapter.write()
       classify any thrown error -> auth | not_found | rate_limit/unknown -> retry | anything else -> failed
  -> reconcile failed[] (drop if not re-represented this cycle, 30-day TTL)
  -> replace retry[] wholesale
  -> advance cursor (unless an auth error occurred this cycle)
  -> saveSyncState(...)
```

Mapping profiles and the canonical schema are loaded **once per cycle**, not per record — a deliberate perf choice, safe because nothing in a single cycle changes them mid-run.

## 4. Adapter contract

Every provider adapter (`ConnectWiseAdapter`, `KekaAdapter`) implements the same five methods. This is what makes `adapter-registry.js` a one-line-per-provider lookup table, and what a new provider must implement to plug in.

```js
class SomeAdapter {
  // Storage-agnostic as of the ipaas.providers split (2026-09-08): the
  // adapter no longer loads its own credentials. The caller — this repo's
  // adapter-registry.js — loads them via lib/credentials.js and passes
  // them in, along with a save-back callback for providers that refresh a
  // token mid-flow (Keka). createAdapter() is async for this reason.
  constructor(tenantId, credentials, { onCredentialsRefreshed } = {}, logger)

  // Ensures a valid token/credential is cached for this call. ConnectWise:
  // static key pair, nothing to refresh, just returns the credentials as
  // given. Keka: OAuth client-credentials token, refreshed when within 60s
  // of expiry, then reported back via onCredentialsRefreshed(updatedCreds)
  // so the caller can persist it — the adapter itself never writes to
  // storage.
  async authenticate()

  // One page of delta records.
  // opts: { pageNumber, pageSize, modifiedSince }
  // returns: { records, pageNumber, totalPages, hasMore }
  async fetch(entity, opts)

  // Re-fetches specific records by external ID — used only for
  // sync_state.failed/retry reconciliation. NEW surface, added during this
  // engine's build — not present in any provider's real API docs reviewed
  // so far. Both adapters' implementations are UNVERIFIED (see §6).
  async fetchByIds(entity, ids)

  // Creates one target-shaped record in the provider's collection.
  async write(entity, record)

  // Replaces one target-shaped record at the provider's item endpoint.
  async update(entity, id, record)
}
```

**Error typing contract** — every adapter method that hits the network must throw an `Error` with a `.type` property, not a bare message, because `cycle.js` branches on `err.type`:

| `err.type` | Meaning | HTTP status (as mapped today) | Cycle behavior |
|---|---|---|---|
| `auth` | Credentials rejected | 401, 403 | Stops the whole cycle immediately; cursor does **not** advance; nothing added to failed/retry for unprocessed records |
| `not_found` | Record no longer exists upstream | 404 | Dropped silently — not tracked anywhere |
| `rate_limit` | Provider throttled the request | 429 | Added to `retry` |
| `validation` | Provider rejected the payload shape | 400 | Added to `failed` |
| `unknown` / no `.type` | Anything else, including canonical-schema validation failures raised inside `cycle.js` itself (not an HTTP call) | any other status, or n/a | Added to `retry` if truly `unknown`/untyped; canonical validation failures are explicitly typed `validation` and so land in `failed` instead |

This table is the single most important contract in the engine — get an error's `.type` wrong in a new adapter and a record silently ends up in the wrong reconciliation bucket.

## 5. Mapping and canonical validation

`canonical_entities` holds a JSON Schema per entity name + version (ajv-compiled, cached by `name:version`). `mapping_profiles` holds per-tenant, per-provider+entity+direction field-mapping rules, with exactly one `is_active` row enforced per combination (partial unique index).

**Tenant vs. global mapping (added 2026-09-03).** A tenant is not required to have its own `mapping_profiles` row. `global_mapping_profiles` holds a platform-level default per provider+entity+direction (same shape, minus `tenant_id`), and `lib/mapping/profiles.js`'s `loadActiveMappingProfile` resolves in this order:

```
1. active mapping_profiles row for (tenant, provider, entity, direction)  -> source: 'tenant'
2. active global_mapping_profiles row for (provider, entity, direction)  -> source: 'global'
3. neither exists -> throw
```

This is deliberately **not** copy-on-inherit — an inheriting tenant has no row of its own, so it picks up whatever the global default currently is, fresh every cycle (nothing here is cached across cycles). Improving the global default improves every inheriting tenant on its next run, with no backfill needed. The trade-off: that's also a live behavior change for every inheriting tenant with no per-tenant review point today — worth a change-notice mechanism before this is tenant-facing in production. The resolved profile carries `source: 'tenant' | 'global'`, and `cycle.js` logs it at cycle start (`inboundMappingSource` / `outboundMappingSource`) specifically so this is visible without a second query.

Both tables are keyed by a single `provider` per direction, never a source/target pair. An inbound mapping depends only on the source provider (it builds the canonical shape from that provider's raw fields); an outbound mapping depends only on the target provider (it builds that provider's shape from the canonical record) — neither needs to know the other side, because both go through the same `canonical_entities` shape in between. Keying by (source, target) pairs instead would require one mapping per pairing and grow as N×N providers; keying by a single provider per direction stays N+N, and any source can combine with any target for free.

Inbound rule: `{ canonicalField, sourceField, transform? }` — reads `sourceField` off the raw provider record, writes to `canonicalField`.
Outbound rule: `{ canonicalField, targetField, transform? }` — reads `canonicalField` off the canonical record, writes to `targetField`.

```js
function applyMapping(profile, input) {
  const output = {};
  for (const rule of profile.field_mappings) {
    let value = extractField(input, rule.sourceField ?? rule.canonicalField);
    if (rule.transform) value = applyTransform(rule.transform, value);
    output[rule.targetField ?? rule.canonicalField] = value;
  }
  return output;
}
```

Two transform types exist: `enumMap` (value lookup table with a `default` fallback — e.g. ConnectWise's `Active`/`Inactive` → canonical `active`/`inactive`) and `toString` (added because ConnectWise's numeric `id` failed the canonical schema's string-typed `id` field — a real bug hit and fixed during this build, not a hypothetical).

**Canonical records are never persisted.** Each cycle builds one in memory, validates it, maps it onward, and discards it. This is a deliberate departure from an earlier (pre-rebuild) design that persisted canonical rows to decouple inbound/outbound stages — unnecessary here because one cycle runs fetch→map→write as a single in-memory pipeline, not decoupled stages.

## 6. sync_state and reconciliation

One `sync_state` row per `sync_entities` row (1:1). Two independent failure lists, with different semantics:

**`failed`** — data-shape problems (canonical validation failures, HTTP 400s). Assumed to need a real upstream fix, not a transient retry. Every entry is re-fetched by ID and re-attempted **every cycle** (self-healing): if it succeeds or the record no longer reproduces the failure, it's dropped; if it still fails, its `first_failed_at` carries forward and it's dropped anyway once 30 days old (`FAILED_TTL_MS`).

**`retry`** — technical failures (429s, unclassified errors). Assumed transient. The list is **replaced wholesale** every cycle from whatever failed *this* run — no TTL, no carry-forward bookkeeping, because a technical failure that stops recurring simply stops appearing.

**Cursor** — `sync_state.cursor.modifiedSince`, an ISO timestamp. Advances to `cycleStart - 60s` (a safety buffer absorbing source-side write lag) on every clean run. On an `auth` error, the cursor is left untouched, since an auth failure means we can't be sure what was actually attempted before the cycle stopped.

**Merge order**: reconciliation records are loaded into a `Map` first, then delta records are loaded on top — so if an ID appears in both (e.g. it was in `retry` and also happens to fall in this cycle's delta window), the fresher delta record wins.

## 7. Run policy by sync_type (`schedule.js`'s `runEntityOnce`)

**Redesigned 2026-09-08, narrowed further the same day — this is no longer a scheduler, and it no longer owns `interval` lifecycle status either.** `schedule.js` used to own timing (a self-rescheduling `setTimeout` loop for `interval` entities, keeping the process alive indefinitely). That's gone. It briefly also kept setting `sync_entities.status = 'active'` on every `interval` invocation — that's gone too, on the reasoning that if timing isn't this engine's job anymore, reasserting a lifecycle status on every run isn't either; that's a Provisioning Engine concern (set once, when the recurring trigger is first set up), not something to repeat on every cycle.

| `sync_type` | Behavior |
|---|---|
| `one_time` | Runs `runCycle` once for the current sweep, then sets `sync_entities.status` to `completed` or `failed`. This is the **one** case where this engine writes `sync_entities.status`, because the terminal outcome is genuinely only knowable after the cycle runs. The discovery query currently returns every configured entity; lifecycle filtering or removal of completed one-time rows must be handled outside this per-entity policy if repeated sweeps should exclude them. |
| `interval` | Runs `runCycle` once. **Does not touch `sync_entities.status` at all** — not before, not after, regardless of outcome. The run's actual result lives in `sync_state.last_run_status`/`last_error`, which is already the correct source of truth for "how did this run go." Whether the entity is `active` is a lifecycle fact owned by the Provisioning Engine (not yet built) — until that exists, nothing flips a freshly-inserted `interval` entity from `submitted` to `active` automatically; set it by hand via SQL when testing, same as every other manual step in today's intake path (creating the tenant/`sync_requests`/`sync_entities` rows themselves). |
| `real_time` | Not handled — `runEntityOnce` throws immediately: `"Unsupported sync_type ... real_time entities belong to a separate engine, not this one."` Being invoked with a `real_time` entity is an infra routing bug, not a case to silently tolerate. |

Every invocation of `run.js` exits after the tenant/entity loops finish — `pool.end()` and `process.exit(0)` run unconditionally, with no branch on `sync_type` at that layer (see §3). Each returned entity is passed to `runEntityOnce` using its database-provided ID.

## 8. Known-unverified surface

These are explicitly flagged in code comments and must be confirmed against real accounts before any tenant relies on them:

- **`fetchByIds` (both adapters)** — a new method invented for this engine's reconciliation design; not documented in either provider's real API. ConnectWise guesses `conditions=id in (1,2,3)`; Keka guesses an `ids=` query param. Neither has been called against a real account.
- **ConnectWise `project`/`timesheet` endpoints** (`project/projects`, `time/entries`) — guessed by convention from the verified `client` endpoint, not confirmed.
- **Keka `project`/`timesheet` endpoints** — same caveat, plus lower confidence on `timesheet`: Keka is primarily an HR platform, so time tracking may live outside the `/psa/` namespace entirely; `/api/v1/time/entries` is flagged as an alternate candidate if `/api/v1/psa/timesheets` turns out wrong.
- **Keka writes and updates** — the shared POST/PUT structure is implemented, but those resource paths and payloads remain unverified against a real account. Keka's Client create/update endpoints are documented by the provider.
- **ConnectWise writes and updates** — the authenticated POST/PUT collection/item structure is implemented but has not been live-verified against a real account; confirm payload and response shapes before using ConnectWise as a target.

What **is** verified live: ConnectWise `client` fetch (pagination via `Link` header, auth via static key pair) and Keka `client` fetch + token refresh (see `docs/LLD-connector-auth-layer.md`).

## 9. Containerization

**Image**: `Dockerfile` at the repo root, multi-stage (`node:22-alpine`). The `deps` stage runs `npm ci --omit=dev` from `package.json`/`package-lock.json` alone — since the 2026-09-08 repo split, `@rajkamal29/adapter-connectwise` and `@rajkamal29/adapter-keka` are ordinary npm dependencies (see `package.json`), not local workspace packages, so there's no adapter source to copy into this stage anymore. The `runtime` stage copies only `node_modules`, `lib/`, and `package.json`; runs as the non-root `node` user; entrypoint is `CMD ["node", "lib/orchestration/run.js"]`. `scripts/` is intentionally not in the image (mock/demo tooling only). Migrations aren't part of this repo at all anymore — they moved to `ipaas.infra` in the same 2026-09-08 split that pulled Postgres out; they run separately against Postgres from there, never inside this container.

**Docker build is currently broken** until the registry connection deferred by the repo split is set up: `npm ci` needs to resolve the two `@rajkamal29/*` packages from GitHub Packages' npm registry (`npm.pkg.github.com`), and neither has been published there yet. Locally this repo works around it with `npm link` against the sibling `ipaas.providers` folder (not usable inside a container build, which has no access to a sibling checkout). Before this image builds again: publish both adapter packages, then add an `.npmrc` (registry + auth token) step to both this Dockerfile and `.github/workflows/build-orchestration-engine.yml`.

**Runtime inputs** are platform-level only:

| Vars | Set by |
|---|---|
| `DATABASE_URL`, `ENCRYPTION_MASTER_KEY` | Whatever deploys the container — never baked into the image and never tenant-specific |

Tenant IDs, sync entity IDs, provider pairings, and entity configuration all come from Postgres during the sweep. Tenant credentials remain encrypted in Postgres and are looked up internally by `(tenantId, provider)`; they are never exposed through container environment variables or `docker inspect` output.

**Found while wiring this up**: `pg` and `dotenv` were listed under `devDependencies` in `package.json`, but both are required unconditionally at runtime (`lib/db.js` requires `pg`; `run.js`/every script calls `require('dotenv').config()`). `npm ci --omit=dev` would have silently produced a broken image. Moved both to `dependencies`; `package-lock.json` regenerated to match. `pino-pretty` correctly stays dev-only — it's only required by `lib/logger.js` when `NODE_ENV !== 'production'` (the image sets `NODE_ENV=production`, so that branch never runs). `node-pg-migrate` isn't a dependency of this repo at all anymore — it moved to `ipaas.infra`'s `package.json` along with the migrations themselves.

**CI pipeline**: `.github/workflows/build-orchestration-engine.yml`. Branch model is feature → `dev` → `main`; the workflow triggers on push to `dev` only (i.e. once a feature branch's PR is reviewed and merged), scoped to paths that actually affect the image (`lib/orchestration/**`, `lib/mapping/**`, `packages/adapters/**`, `Dockerfile`, the workflow file itself), plus manual dispatch. It builds once and pushes to both registries in the same run:

- GHCR: `ghcr.io/<repository_owner>/ipaas-orchestration-engine:dev-latest` and `:dev-<short-sha>`
- Docker Hub: `<DOCKERHUB_USERNAME>/ipaas-orchestration-engine:dev-latest` and `:dev-<short-sha>`

Tags are `dev-`-prefixed deliberately, not bare `latest` — nothing publishes from `main` yet, so there's no ambiguity today, but a future `main` release build would need its own distinct tag (e.g. `stable`/`v*`) rather than colliding with these. GHCR auth uses the workflow's built-in `GITHUB_TOKEN` (no extra secret); Docker Hub needs `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` added as repo secrets.

## 10. Extending the engine

**Adding a provider**: implement the five-method adapter contract (§4), including correct `.type` classification in error handling, then add one line to `REGISTRY` in `adapter-registry.js`. Nothing else in the engine changes.

**Adding an entity** (e.g. finishing `project`/`timesheet`): add a `canonical_entities` schema row, seed the inbound + outbound mappings in `global_mapping_profiles` (so every tenant has a working default from the start) and/or `mapping_profiles` for any tenant that needs a customization, add the entity to each adapter's `ENTITY_ENDPOINTS` map (verifying the guessed endpoints first), and add the entity name to the relevant CHECK constraints (`sync_entities.entity`, `canonical_entities.name`, `mapping_profiles.entity`, `global_mapping_profiles.entity`). No changes to `cycle.js`, `schedule.js`, or `run.js` are needed — the pipeline is already entity-agnostic.

**Adding a transform type**: add a `case` to `applyTransform` in `lib/mapping/engine.js`. Existing types: `enumMap` (lookup table + default), `toString`.
