# Core Schema — Tenant Intake, Credentials, Run State & Mapping

Covers `20260901120000_create-core-schema.js`, `20260901140000_create-sync-state.js`, `20260901150000_add-interval-seconds.js`, `20260901160000_create-mapping-layer.js`, `20260903120000_create-global-mapping-profiles.js`, and `20260916120000_add-successful-sync-state.js`. Eight tables: `tenants`, `sync_requests`, `sync_entities`, `credentials`, `sync_state`, `canonical_entities`, `mapping_profiles`, `global_mapping_profiles`.

This schema covers **intake** (a tenant selecting providers, entities, and a sync type), **credentials** (encrypted per-provider secrets), **run state** (per-entity cursor and failure tracking), and **mapping** (canonical schema + per-tenant field mappings). It does not persist canonical records — see the `mapping_profiles`/`canonical_entities` section below for why.

## Relationships

```
tenants (1) ──< sync_requests (1) ──< sync_entities (1) ── (1) sync_state
tenants (1) ──< credentials
```

- One tenant has many `sync_requests`.
- One `sync_requests` row has many `sync_entities` rows.
- One `sync_entities` row has exactly one `sync_state` row (1:1) — created once that entity starts running.
- One tenant has many `credentials` rows — at most one per provider (enforced by a unique constraint on `tenant_id, provider`).
- `credentials` is **not** linked to `sync_requests` directly. A request's engine looks up credentials by `(tenant_id, source)` and `(tenant_id, target)` at run time, so the same provider's credentials are reused across every request that touches that provider — nothing is duplicated if, say, Keka is a target in one request and a source in another.

## `tenants`

Identity only — who the tenant is. Nothing about what they're syncing lives here.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `name` | text | unique — the tenant's name (e.g. `OculusIT`) |
| `created_at` | timestamptz | |

## `sync_requests`

One row per source→target pairing a tenant has asked for (e.g. "ConnectWise to Keka"). A tenant can submit as many of these as it wants over time — including a reverse pairing (Keka to ConnectWise) as a separate row.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK → `tenants.id` | `ON DELETE CASCADE` |
| `source` | text | `connectwise` or `keka` (CHECK constraint) |
| `target` | text | `connectwise` or `keka` (CHECK constraint) |
| `created_at` | timestamptz | |

No `status` column here on purpose — see `sync_entities` below. A request's overall status, if ever needed, is an aggregate over its entities' statuses, not a separately stored value that could drift out of sync with them.

## `sync_entities`

One row per entity selected within a `sync_requests` row, each with its **own** sync type and lifecycle. This is what lets Client run on `interval` while Timesheet runs `one_time`, under the same request.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `sync_request_id` | uuid, FK → `sync_requests.id` | `ON DELETE CASCADE` |
| `entity` | text | `client`, `project`, or `timesheet` (CHECK constraint) |
| `sync_type` | text | `real_time`, `interval`, or `one_time` (CHECK constraint) |
| `status` | text | `submitted`, `provisioning`, `active`, `completed`, or `failed` (CHECK constraint) |
| `interval_seconds` | integer | required + floored at 60 when `sync_type = 'interval'`; must be `NULL` otherwise (CHECK constraint) |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique constraint on `(sync_request_id, entity)` — the same entity can't be added twice to one request.

**On `sync_type`:** `real_time` is a valid, storable value today even though nothing can execute it yet — the current design has no webhook/event layer, only polling. It's there so the intake schema doesn't block the UI later; the engine just won't pick up `real_time` rows until that layer exists.

**On `interval_seconds`:** per-entity cadence, not a single platform-wide default — each tenant's `interval` entity can run on its own schedule. The 60-second floor exists to prevent a misconfigured tenant from polling a source API too aggressively.

**On `status`:** this is the *provisioning* lifecycle, not run health. `submitted` → `provisioning` → `active` (recurring types) or `completed` (`one_time` only) → `failed`. Whether the *last run* actually succeeded, and what its incremental cursor was, is tracked separately in `sync_state` below.

## `sync_state`

One row per `sync_entities` row (1:1) — where that entity's sync currently stands. Created once the entity starts running; updated on every subsequent run. Not a run-history log — just the latest state, plus two live, self-maintaining failure lists.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `sync_entity_id` | uuid, FK → `sync_entities.id` | unique — one state row per entity |
| `cursor` | jsonb | nullable until the first successful run; `{"modifiedSince": "2026-09-01T10:00:00Z"}` — an object rather than a bare string so more watermark/resume state can be added later without a schema change |
| `last_run_at` | timestamptz | nullable |
| `last_run_status` | text | nullable — `success` or `failed` (CHECK constraint) |
| `last_error` | text | nullable — short message if the last run failed |
| `failed` | jsonb | default `[]` — see below |
| `retry` | jsonb | default `[]` — see below |
| `sync_state` | jsonb | default `[]` — successful external/target ID mappings for this sync entity |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**`sync_state` successful mappings:** each entry contains only `external_id` and `target_id`. A new entry is added only after a provider create/write succeeds. On later runs, an existing external ID uses its stored target ID for the provider update call and does not add another entry. Failed writes leave successful mappings unchanged. Tenant and sync-entity isolation comes from the owning `sync_state.sync_entity_id` row.

**`failed` vs. `retry` — two different failure classes, two different lifecycles:**

- **`failed`** holds records that failed for a *data* reason (mapping or validation errors — the fetch succeeded, the record just didn't shape correctly). Each entry stores only the ID, not the record itself:
  ```json
  { "external_id": "CW-CLIENT-042", "error_message": "missing required field 'name'", "first_failed_at": "...", "last_checked_at": "..." }
  ```
  Reconciled on **every run**: the engine re-fetches these specific IDs from the source (via the adapter's `fetchByIds`, alongside the normal delta fetch) and re-attempts mapping/write; if a record now succeeds, it's dropped; if it still fails, `last_checked_at`/`error_message` are updated and it's kept; anything with `first_failed_at` older than 30 days is dropped regardless of outcome. Re-fetching by ID (rather than replaying a stored payload) matters here — it's the only way a fix made directly in the source system (e.g. someone corrects the record in ConnectWise) is picked up on retry. This keeps the list self-healing and bounded — it never grows without limit. Pruning is application logic, not a database-level TTL.

- **`retry`** holds records that failed for a *technical* reason (rate limiting, network errors, transient timeouts). Also ID-only:
  ```json
  { "external_id": "CW-PROJ-007", "error_message": "429 Too Many Requests", "error_type": "rate_limit" }
  ```
  **Replaced wholesale** on every run, not appended to — the engine re-fetches every ID currently in the list (same `fetchByIds` path as above) alongside the normal delta records, retries them, and overwrites the column with only whatever's still failing after that attempt. This naturally stays bounded to "what's in flight right now."

An `Info`-style open-ended column was considered and deliberately left out — the one concrete use case raised ("skip a no-op run if already synced") is already covered by `cursor` being non-null and `sync_entities.status = 'completed'`, so a new column wasn't needed for it.

## `credentials`

One row per tenant **per provider** — not per source/target role, and not per `sync_requests` row. Storing it this way means the same provider's credentials are encrypted and stored exactly once, however many requests reference that provider, and a token refresh only ever updates one row.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK → `tenants.id` | `ON DELETE CASCADE` |
| `provider` | text | `connectwise` or `keka` (CHECK constraint) |
| `encrypted_payload` | bytea | AES-256-GCM ciphertext |
| `iv` | bytea | AES-256-GCM nonce |
| `auth_tag` | bytea | AES-256-GCM authentication tag |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique constraint on `(tenant_id, provider)` — a tenant can't have two credential rows for the same provider.

Ciphertext, IV, and auth tag are stored as three separate columns rather than bundled into one JSON blob — standard shape for authenticated encryption, and keeps the encrypted payload itself opaque (no parsing needed to pull out the nonce/tag before decrypting).

## `canonical_entities`

One row per (entity name, version) — the JSON Schema a record must satisfy once mapped to its canonical shape. Global, not per-tenant — a schema itself doesn't vary by tenant, only how a provider maps onto it does (see `mapping_profiles` below).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `name` | text | `client`, `project`, or `timesheet` (CHECK constraint) |
| `version` | integer | |
| `schema` | jsonb | a JSON Schema, validated via `ajv` |
| `created_at` | timestamptz | |

Unique constraint on `(name, version)`.

## `mapping_profiles`

One row per (tenant, provider, entity, direction) — the field-mapping rules for transforming a record in or out of its canonical shape. **Per-tenant**, not global: each tenant can override its own field mappings for the same provider+entity, rather than sharing one fixed mapping platform-wide. A tenant is not required to have a row here at all — see `global_mapping_profiles` below for what happens when it doesn't.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK → `tenants.id` | `ON DELETE CASCADE` |
| `provider` | text | `connectwise` or `keka` (CHECK constraint) |
| `entity` | text | `client`, `project`, or `timesheet` (CHECK constraint) |
| `direction` | text | `inbound` (provider → canonical) or `outbound` (canonical → provider) (CHECK constraint) |
| `version` | integer | |
| `field_mappings` | jsonb | the mapping rules array — see `lib/mapping/engine.js` |
| `is_active` | boolean | default `true` |
| `created_at` | timestamptz | |

Partial unique index on `(tenant_id, provider, entity, direction) WHERE is_active` — exactly one active profile per combination at a time; older versions can stay in the table with `is_active = false` rather than being deleted.

## `global_mapping_profiles`

Platform-level default mapping profiles (LLD discussion, 2026-09-03) — same shape as `mapping_profiles` minus `tenant_id`. Solves onboarding: without this table, a new tenant on an already-supported provider has nothing to sync with until someone manually seeds its `mapping_profiles` rows. With it, a tenant that never customizes its mapping inherits this table's active row automatically.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `provider` | text | `connectwise` or `keka` (CHECK constraint) |
| `entity` | text | `client`, `project`, or `timesheet` (CHECK constraint) |
| `direction` | text | `inbound` or `outbound` (CHECK constraint) |
| `version` | integer | |
| `field_mappings` | jsonb | same rule shape as `mapping_profiles` |
| `is_active` | boolean | default `true` |
| `created_at` | timestamptz | |

Partial unique index on `(provider, entity, direction) WHERE is_active` — mirrors `mapping_profiles_one_active_idx`, just without a tenant dimension.

**Resolution order** (`lib/mapping/profiles.js`'s `loadActiveMappingProfile`): look for an active `mapping_profiles` row for this tenant+provider+entity+direction first; if none exists, fall back to the active `global_mapping_profiles` row for that same provider+entity+direction; throw only if neither exists.

**Deliberately not copy-on-inherit.** A tenant that inherits does not get a snapshot copied into `mapping_profiles` at the moment it starts inheriting — it simply has no row there, and the fallback resolves to whatever `global_mapping_profiles` currently says, fresh every cycle (profiles are never cached across cycles). This means improving the global default improves every inheriting tenant immediately and automatically, with no migration or backfill. It also means "inherited" vs. "customized" needs no separate flag anywhere — it's just "does an active `mapping_profiles` row exist for this tenant" — but it does mean a global default change is a live behavior change for every tenant still inheriting it, with no per-tenant review point today. Worth a change notice of some kind before this reaches production; not built yet.

**Keyed by a single `provider`, not a source/target pair, same as `mapping_profiles`.** An inbound mapping only depends on the source provider, an outbound mapping only depends on the target provider — both go through the shared `canonical_entities` shape in between. Keying by pairs would grow the seed set as N×N providers; this stays N+N.

**Why no `canonical_records` table:** the pre-reset design persisted every canonical-shaped record so inbound and outbound could run as decoupled stages — outbound reading already-persisted rows independently of when inbound ran. The current engine doesn't work that way: one `sync_requests` container runs fetch → map inbound → validate → map outbound → write as a single in-memory pipeline within one cycle (`lib/orchestration/cycle.js`), never split across separate runs. So a canonical record only ever exists transiently inside one cycle's memory — persisting it would add a table with no current consumer.

A validation failure against `canonical_entities.schema` is treated as a data-shape error, landing in `sync_state.failed` exactly like a mapping error would — no separate error path needed for it.

## Deliberately out of scope here

- **Full run history** — `sync_state` tracks only the *current* state per entity, not a log of every past run. A history/audit table is a separate, later addition if it's ever needed.
- **A `providers` lookup table** — `source`/`target`/`provider` are plain text with a `CHECK` constraint today since there are only two providers. Worth revisiting as an actual reference table if a third provider is ever added.
