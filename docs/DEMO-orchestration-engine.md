# Orchestration Engine Demo — Mock ConnectWise/Keka Walkthrough

A repeatable, no-real-credentials-needed demo of the Orchestration Engine running end-to-end: dynamic adapter loading, real mapping/canonical validation, the fetch → map → write cycle, and the self-healing `failed`/`retry` reconciliation on `sync_state`.

**What this proves:** the engine's own logic works correctly, through the real code path — not a simplified stand-in.
**What this does NOT prove:** anything about the real ConnectWise/Keka APIs. The mock server fakes response *shapes* only; endpoint paths, auth mechanics, and `fetchByIds` filter syntax are still unverified against the real systems (see `docs/LLD-connector-auth-layer.md`). Say this explicitly when presenting — it's a logic demo, not proof the real integrations work yet.

## Prerequisites

- Postgres running and migrated — see `docs/migrations/OPERATIONS.md` (`docker compose up -d`, `npm install`, `npm run migrate:up`)
- Mock server + test data set up once (below) — persists in Postgres, so this is normally a one-time step per database

## One-time setup

**IDs already created and in use for every demo so far** — reuse these unless the database has been wiped (`docker compose down -v`):

- `tenant_id`: `e21e3c1a-730f-4134-bd4f-5290aeb73628` (OculusIT)
- `sync_request_id`: `3ead6a00-870e-46fa-81c4-546f2f6a5709` (ConnectWise → Keka)
- `client` entity: `sync_type = 'one_time'` (runs once per invocation — good for a demo; switch to `interval` to show recurring behavior instead)

**If starting from a fresh database**, recreate everything in order:

1. Create the tenant, sync request, and entity — via `docker exec -it ipaas-postgres psql -U ipaas -d ipaas_platform`:
   ```sql
   INSERT INTO tenants (name) VALUES ('OculusIT') RETURNING id AS tenant_id \gset

   INSERT INTO sync_requests (tenant_id, source, target)
   VALUES (:'tenant_id', 'connectwise', 'keka')
   RETURNING id AS sync_request_id \gset

   INSERT INTO sync_entities (sync_request_id, entity, sync_type, status)
   VALUES (:'sync_request_id', 'client', 'one_time', 'submitted');

   SELECT :'tenant_id' AS tenant_id, :'sync_request_id' AS sync_request_id;
   ```
   Note down both IDs — needed below.

2. Seed fake credentials pointing at the mock server (needs the mock server already running — see step 1 below):
   ```
   node scripts/seed-mock-credentials.js <tenant_id>
   ```

3. Seed the canonical Client schema + both mapping profiles:
   ```
   node scripts/seed-mock-mapping.js <tenant_id>
   ```

## Running the demo

**1. Start the mock server** (its own terminal, leave running):
```
node scripts/mock-server.js
```
Fakes 5 ConnectWise "companies" and a Keka write endpoint rigged to demonstrate specific outcomes (see script comments): 3 always succeed, 1 always fails with a data-shape rejection (HTTP 400), 1 fails once with a rate limit (HTTP 429) then succeeds.

**2. Run the actual engine entrypoint** (PowerShell — note the `$env:` syntax, the Unix `VAR=value command` form won't work in this shell):
```powershell
$env:SYNC_REQUEST_ID="3ead6a00-870e-46fa-81c4-546f2f6a5709"; node lib/orchestration/run.js
```

This is the real `lib/orchestration/run.js` — the same entrypoint a container would run in production, with `SYNC_REQUEST_ID` standing in for what the (not-yet-built) Provisioning Engine will eventually pass in automatically. Everything else — tenant, source, target, entities, credentials, mapping profiles — is loaded from Postgres using just that one ID.

**Expected output, run 1:** logs show the full pipeline — fetch, real mapping (inbound → canonical → outbound), schema validation, write, `sync_state` update. 5 records fetched; 3 written successfully; `id: 2` lands in `sync_state.failed` (data-shape rejection — HTTP 400, classified as `validation`); `id: 3` lands in `sync_state.retry` (HTTP 429, classified as `rate_limit`). The process exits cleanly once done (since `client` is `one_time`, there's nothing recurring to stay alive for).

**3. Run it again, same command, mock server left untouched:**
```powershell
$env:SYNC_REQUEST_ID="3ead6a00-870e-46fa-81c4-546f2f6a5709"; node lib/orchestration/run.js
```

**Expected output, run 2:** `id: 2` is still in `failed` (it always fails — the list is genuinely self-maintaining, re-checked every run, not just cleared blindly). `id: 3` has dropped out of `retry` entirely — it was re-fetched by ID and re-written successfully. This is the reconciliation logic actually running, not the happy path.

To inspect `sync_state` directly instead of relying on log output:
```sql
SELECT cursor, last_run_status, failed, retry FROM sync_state
WHERE sync_entity_id = (SELECT id FROM sync_entities WHERE entity = 'client');
```

## Talking points for each step

- **Dynamic adapter loading:** the container never hardcodes ConnectWise or Keka by name — `source`/`target` come from the `sync_requests` row, and the right adapter class is chosen at runtime via a lookup table.
- **Real mapping, not a stand-in:** every record goes through an actual per-tenant mapping profile (provider → canonical → provider) and is validated against a canonical JSON Schema before being written — this is the same mapping engine any provider pairing would use, not a demo-only shortcut.
- **Two distinct failure classes, both live in the same run:** a data-shape rejection (`failed`) is assumed to need a real fix and is re-checked every cycle with a 30-day cutoff; a technical failure (`retry`) is assumed transient and is retried wholesale every cycle. Run 2 shows both behaviors side by side.
- **Nothing hardcoded per entity:** the same code ran for the `client` entity here — the same engine handles `project`/`timesheet` once those adapters are extended, no branching required.
- **This is the real entrypoint, not a test harness:** `run.js` is what a container actually executes — the only thing standing in for production here is that a person set `SYNC_REQUEST_ID` by hand instead of the Provisioning Engine doing it automatically.

## Resetting for a clean re-run

Not required for the demo to work correctly (state accumulating and self-healing across runs is the point), but to reproduce the exact "fresh first run" a second time:

```sql
DELETE FROM sync_state WHERE sync_entity_id = (SELECT id FROM sync_entities WHERE entity = 'client');
UPDATE sync_entities SET status = 'submitted' WHERE entity = 'client';
```

and restart the mock server (Ctrl+C, then `node scripts/mock-server.js` again) — its in-memory retry counter for `id: 3` only resets when the process restarts, not between cycles.

## Lower-level debugging alternative

`scripts/test-run-cycle.js <sync_request_id>` runs a single entity's cycle directly (bypassing scheduling/status updates) and prints `sync_state` inline — useful for isolating a problem in the fetch/map/write pipeline itself without the full engine's scheduling logic in the way. Not what should be shown in an actual demo — `run.js` is the real thing.

## Related docs

- `docs/migrations/README.md` — schema this demo runs against (`tenants`, `sync_requests`, `sync_entities`, `sync_state`, `credentials`, `canonical_entities`, `mapping_profiles`)
- `docs/LLD-connector-auth-layer.md` — what's real/verified vs. guessed in the actual adapters
- `scripts/mock-server.js`, `scripts/seed-mock-credentials.js`, `scripts/seed-mock-mapping.js` — the three one-time setup scripts
- `lib/orchestration/run.js` — the real entrypoint this demo runs
