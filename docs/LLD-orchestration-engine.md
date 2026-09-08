# Orchestration Engine — Technical Reference

Audience: engineers implementing, extending, or debugging the Orchestration Engine. This document describes the system as it actually exists in code today, not as originally planned — where an earlier design was corrected or diverged, that's called out explicitly.

Related docs: `docs/migrations/README.md` (full schema reference), `docs/LLD-connector-auth-layer.md` (what's live-verified vs. guessed per provider), `docs/DEMO-orchestration-engine.md` (runnable walkthrough against a mock server).

---

## 1. Scope and container model

**Redesigned 2026-09-08.** This is the batch/polling engine — `one_time` and `interval` sync types only. `real_time` is explicitly out of scope, handled by a separate, not-yet-built webhook/queue-driven engine (see the end of this section).

One container **invocation** is scoped to exactly **one `sync_entities` row** — not a tenant, not a whole `sync_requests` row, not multiple entities at once. This changed from an earlier design that scoped a container to a whole `sync_requests` row and ran every entity under it concurrently with its own internal timers. That design was walked back because entities under the same request can have independent cadences (Client on a 5-minute interval, Timesheet as a one-time backfill, under the same ConnectWise→Keka pairing) — timing that fine-grained has to be driven per-entity, not per-request.

The only input an invocation needs is `SYNC_ENTITY_ID` (an env var). Everything else — tenant, source/target provider, credentials, mapping profiles — is loaded from Postgres via one JOIN back to the entity's parent `sync_requests` row. **Every invocation runs its entity's cycle exactly once, then exits.** There is no in-process scheduling, no long-lived loop, no "stay alive for recurring entities" behavior — that used to exist and was deliberately removed.

Deciding *when* to invoke the container — once for a `one_time` entity, repeatedly on a cadence for an `interval` entity matching `sync_entities.interval_seconds` — is entirely the Provisioning Engine / infra layer's job (a separate, platform-level component, not yet built, out of scope for this document). This engine does not create containers, does not decide when a tenant syncs, and does not manage its own lifecycle beyond the one cycle it's told to run.

`real_time` entities should never be routed to this engine at all — infra routing them here is a mistake, and `schedule.js` throws rather than silently tolerating it (see §7). Event-driven sync belongs to a separate engine, designed around a long-lived webhook receiver or queue consumer instead of a run-once-and-exit container — a fundamentally different execution model that doesn't fit this one. That engine's design hasn't started.

## 2. Module map

```
lib/orchestration/
  run.js              entrypoint — what the container actually executes
  bootstrap.js         loads one sync_entities row + its parent sync_requests row
  adapter-registry.js  provider name -> adapter class lookup
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

packages/adapters/
  connectwise/index.js  ConnectWiseAdapter
  keka/index.js          KekaAdapter
```

## 3. Execution flow

```
run.js
  -> loadSyncEntityRun(SYNC_ENTITY_ID)         [bootstrap.js — one JOIN, one entity]
  -> createAdapter(source, tenantId)            [adapter-registry.js]
  -> createAdapter(target, tenantId)
  -> runEntityOnce(entityRow, ...)              [schedule.js]
       one_time  -> runCycle() once -> sync_entities.status = completed|failed
       interval  -> sync_entities.status = active (set before the attempt,
                     left alone regardless of this run's outcome) -> runCycle() once
       real_time -> throws — routing error, this engine doesn't handle it
  -> pool.end(); process.exit(0)   — unconditional, every invocation exits
```

There is no branch on "stay alive" anymore — every invocation, regardless of `sync_type`, runs exactly one cycle and exits. Recurrence for `interval` entities comes entirely from being invoked again later by the Provisioning Engine / infra, not from anything inside this process.

`runCycle` (per entity, per invocation) does the actual work:

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

Every provider adapter (`ConnectWiseAdapter`, `KekaAdapter`) implements the same four methods. This is what makes `adapter-registry.js` a one-line-per-provider lookup table, and what a new provider must implement to plug in.

```js
class SomeAdapter {
  constructor(tenantId, logger)

  // Loads/refreshes credentials for this tenant+provider. Cached for the
  // adapter instance's lifetime (ConnectWise: static key pair, nothing to
  // refresh. Keka: OAuth client-credentials token, refreshed and written
  // back to `credentials` when within 60s of expiry).
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

  // Writes one target-shaped record. Throws if the provider isn't
  // configured/verified as a write target (e.g. ConnectWiseAdapter.write()
  // always throws "not implemented" — no tenant has needed ConnectWise as
  // a target yet).
  async write(entity, record)
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
| `one_time` | Runs `runCycle` once, sets `sync_entities.status` to `completed` or `failed`. Terminal — this entity is never invoked again by design. This is the **one** case where this engine still writes `sync_entities.status`, because the terminal outcome is genuinely only knowable here, after the cycle runs. |
| `interval` | Runs `runCycle` once. **Does not touch `sync_entities.status` at all** — not before, not after, regardless of outcome. The run's actual result lives in `sync_state.last_run_status`/`last_error`, which is already the correct source of truth for "how did this run go." Whether the entity is `active` is a lifecycle fact owned by the Provisioning Engine (not yet built) — until that exists, nothing flips a freshly-inserted `interval` entity from `submitted` to `active` automatically; set it by hand via SQL when testing, same as every other manual step in today's intake path (creating the tenant/`sync_requests`/`sync_entities` rows themselves). |
| `real_time` | Not handled — `runEntityOnce` throws immediately: `"Unsupported sync_type ... real_time entities belong to a separate engine, not this one."` Being invoked with a `real_time` entity is an infra routing bug, not a case to silently tolerate. |

Every invocation of `run.js` exits after exactly one call to `runEntityOnce` — `pool.end()` and `process.exit(0)` run unconditionally, with no branch on `sync_type` at that layer at all (see §3). Recurrence lives entirely outside this codebase now.

## 8. Known-unverified surface

These are explicitly flagged in code comments and must be confirmed against real accounts before any tenant relies on them:

- **`fetchByIds` (both adapters)** — a new method invented for this engine's reconciliation design; not documented in either provider's real API. ConnectWise guesses `conditions=id in (1,2,3)`; Keka guesses an `ids=` query param. Neither has been called against a real account.
- **ConnectWise `project`/`timesheet` endpoints** (`project/projects`, `time/entries`) — guessed by convention from the verified `client` endpoint, not confirmed.
- **Keka `project`/`timesheet` endpoints** — same caveat, plus lower confidence on `timesheet`: Keka is primarily an HR platform, so time tracking may live outside the `/psa/` namespace entirely; `/api/v1/time/entries` is flagged as an alternate candidate if `/api/v1/psa/timesheets` turns out wrong.
- **`KekaAdapter.write()`** — endpoint, HTTP method, and body shape are all a best guess (POST to the same URL used for GET). Never called against the real API.
- **`ConnectWiseAdapter.write()`** — not implemented at all; throws unconditionally. Only needed if a tenant's `sync_requests` row ever has ConnectWise as `target`.

What **is** verified live: ConnectWise `client` fetch (pagination via `Link` header, auth via static key pair) and Keka `client` fetch + token refresh (see `docs/LLD-connector-auth-layer.md`).

## 9. Containerization

**Image**: `Dockerfile` at the repo root, multi-stage (`node:22-alpine`). The `deps` stage runs `npm ci --omit=dev` from `package.json`/`package-lock.json` plus each adapter workspace's own `package.json` (needed for npm to resolve the workspace tree before any source is copied — keeps this layer cached across unrelated code changes). The `runtime` stage copies only `node_modules`, `lib/`, `packages/adapters/` (real source, not just manifests — npm's workspace symlinks under `node_modules/@ipaas/*` point at these relative paths and resolve to nothing without it), and `package.json`; runs as the non-root `node` user; entrypoint is `CMD ["node", "lib/orchestration/run.js"]`. `migrations/` and `scripts/` are intentionally not in the image — migrations run separately against Postgres, never inside this container, and `scripts/` is mock/demo tooling.

**Runtime inputs split into two categories, not one flat list of "env vars":**

| Category | Vars | Set by |
|---|---|---|
| Tenant-scoped config | `SYNC_ENTITY_ID` | Provisioning Engine, one value per invocation — everything else about the tenant/pairing/entity is loaded from Postgres using this ID (§1). Changed from `SYNC_REQUEST_ID` on 2026-09-08 when container scope moved from a whole request to a single entity. |
| Platform secrets | `DATABASE_URL`, `ENCRYPTION_MASTER_KEY` | Whatever deploys the container (Provisioning Engine or its own deployment layer) — never baked into the image, never tenant-specific |

This split was a deliberate decision, not an oversight: passing tenant credentials or broader tenant config as container env vars was considered and rejected earlier in this project specifically because credentials must stay encrypted in Postgres, looked up internally by `(tenantId, provider)` — never present in a container's env or `docker inspect` output. `SYNC_ENTITY_ID` alone is enough for the container to look up everything it needs.

**Found while wiring this up**: `pg` and `dotenv` were listed under `devDependencies` in `package.json`, but both are required unconditionally at runtime (`lib/db.js` requires `pg`; `run.js`/every script calls `require('dotenv').config()`). `npm ci --omit=dev` would have silently produced a broken image. Moved both to `dependencies`; `package-lock.json` regenerated to match. `pino-pretty` and `node-pg-migrate` correctly stay dev-only — `pino-pretty` is only required by `lib/logger.js` when `NODE_ENV !== 'production'` (the image sets `NODE_ENV=production`, so that branch never runs), and `node-pg-migrate` is only invoked via `npm run migrate:*` on the host/CI, never inside this container.

**CI pipeline**: `.github/workflows/build-orchestration-engine.yml`. Branch model is feature → `dev` → `main`; the workflow triggers on push to `dev` only (i.e. once a feature branch's PR is reviewed and merged), scoped to paths that actually affect the image (`lib/orchestration/**`, `lib/mapping/**`, `packages/adapters/**`, `Dockerfile`, the workflow file itself), plus manual dispatch. It builds once and pushes to both registries in the same run:

- GHCR: `ghcr.io/<repository_owner>/ipaas-orchestration-engine:dev-latest` and `:dev-<short-sha>`
- Docker Hub: `<DOCKERHUB_USERNAME>/ipaas-orchestration-engine:dev-latest` and `:dev-<short-sha>`

Tags are `dev-`-prefixed deliberately, not bare `latest` — nothing publishes from `main` yet, so there's no ambiguity today, but a future `main` release build would need its own distinct tag (e.g. `stable`/`v*`) rather than colliding with these. GHCR auth uses the workflow's built-in `GITHUB_TOKEN` (no extra secret); Docker Hub needs `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` added as repo secrets.

## 10. Extending the engine

**Adding a provider**: implement the four-method adapter contract (§4), including correct `.type` classification in error handling, then add one line to `REGISTRY` in `adapter-registry.js`. Nothing else in the engine changes.

**Adding an entity** (e.g. finishing `project`/`timesheet`): add a `canonical_entities` schema row, seed the inbound + outbound mappings in `global_mapping_profiles` (so every tenant has a working default from the start) and/or `mapping_profiles` for any tenant that needs a customization, add the entity to each adapter's `ENTITY_ENDPOINTS` map (verifying the guessed endpoints first), and add the entity name to the relevant CHECK constraints (`sync_entities.entity`, `canonical_entities.name`, `mapping_profiles.entity`, `global_mapping_profiles.entity`). No changes to `cycle.js`, `schedule.js`, or `run.js` are needed — the pipeline is already entity-agnostic.

**Adding a transform type**: add a `case` to `applyTransform` in `lib/mapping/engine.js`. Existing types: `enumMap` (lookup table + default), `toString`.
