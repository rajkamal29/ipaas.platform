# Onboarding a New Tenant — Manual Runbook

This is what to actually do, today, when a real tenant asks for a ConnectWise↔Keka sync. There is no UI and no Provisioning Engine yet (both are still on the backlog — see `ipaas.orchestrationengine/docs/LLD-orchestration-engine.md`), so every step below is a person running a script or a SQL statement by hand. Nothing here is mock or demo data — this is the real path, using real tenant credentials.

If you want to see the engine's logic working without a real tenant (e.g. for a demo), use `ipaas.orchestrationengine/docs/DEMO-orchestration-engine.md` instead — it's the same underlying steps, but with fake credentials pointed at a local mock server.

**Worked example used throughout this doc:** a fictional company, **Contoso Services**, requesting a ConnectWise → Keka sync of their Client data. Swap in the real tenant's name and real credentials when you actually do this. Don't reuse `OculusIT` as a tenant name unless you mean the same row the demo doc already created — `tenants.name` is unique, so a second `INSERT` with that name will fail with a constraint violation.

## Prerequisites

Complete `docs/setup/DEVELOPER_SETUP.md` once first, if you haven't already — this runbook assumes Postgres is already running and migrated, and the platform-level mapping defaults are already seeded (`seed-global-mapping.js`, run from `ipaas.orchestrationengine`). That's a one-time thing per database, not per tenant, which is why it isn't repeated here — see Step 4 below for what it means for a tenant to inherit those defaults.

## Step 1 — Gather what you need from the tenant

Before touching Postgres, get these from the tenant (or their ConnectWise/Keka admin):

**ConnectWise** (API Member key pair, not a user login):
- `baseUrl` — their ConnectWise Manage instance's API base URL (e.g. `https://api-na.myconnectwise.net/v4_6_release/apis/3.0/`)
- `companyId` — their ConnectWise company identifier
- `publicKey` / `privateKey` — the API Member key pair (generated in ConnectWise under System → Member Management → API Members)
- `clientId` — the ConnectWise-issued client ID header value
- `apiVersion` — usually an empty string (`""`) unless their instance pins a specific version in the URL

**Keka** (OAuth client-credentials):
- `apiBaseUrl` — their Keka API base URL
- `identityUrl` — their Keka identity/auth server URL
- `tokenEndpoint` — usually `/identity/token`
- `clientId` / `clientSecret` — the OAuth client credentials
- `apiKey` — Keka's separate API key (sent alongside the OAuth token request)
- `grantType` — usually `client_credentials`
- `scope` — usually `kekaapi`

Exactly which of these you need depends on which side ConnectWise/Keka is on for this tenant (source vs. target) — but in practice you'll have credentials for both, since most tenants eventually sync in both directions.

## Step 2 — Create the tenant, sync request, and sync entity

Open psql:
```powershell
cd ipaas.infra
docker compose exec postgres psql -U ipaas -d ipaas_platform
```

```sql
INSERT INTO tenants (name) VALUES ('Contoso Services') RETURNING id AS tenant_id \gset

INSERT INTO sync_requests (tenant_id, source, target)
VALUES (:'tenant_id', 'connectwise', 'keka')
RETURNING id AS sync_request_id \gset

INSERT INTO sync_entities (sync_request_id, entity, sync_type, status)
VALUES (:'sync_request_id', 'client', 'one_time', 'submitted')
RETURNING id AS sync_entity_id \gset

\echo Tenant:      :tenant_id
\echo SyncRequest: :sync_request_id
\echo SyncEntity:  :sync_entity_id
```

Write down all three IDs. `\q` to exit.

A couple of real decisions hide in that one `INSERT` into `sync_entities`, worth being deliberate about rather than copy-pasting blindly:

- **`sync_type`** — use `one_time` for anything you're going to trigger manually right now (see Step 6). `interval` is a valid value and the schema supports it, but nothing in this codebase currently re-invokes the engine on a schedule — that's the Provisioning Engine's job, and it isn't built yet. Setting `interval` today just means the entity sits there until someone manually re-runs it anyway, so there's no real difference from `one_time` in practice yet — pick `interval` only to signal "this should recur once the Provisioning Engine exists," not because it'll actually recur today.
- **`entity`** — only `'client'` is fully wired up (real mapping + a working canonical schema). `'project'` and `'timesheet'` are valid per the `CHECK` constraint, but neither adapter's endpoints for them are verified, and no canonical schema exists yet for either — see `ipaas.providers/docs/LLD-connector-auth-layer.md`. Don't onboard a tenant onto `project`/`timesheet` expecting it to actually sync yet.

## Step 3 — Insert the real credentials

This is the step that didn't have a script until this doc — `seed-mock-credentials.js` only writes fake values pointed at the local mock server. Use `seed-credentials.js` instead:

1. Create a JSON file with the fields you gathered in Step 1 — for ConnectWise:
   ```json
   {
     "baseUrl": "https://api-na.myconnectwise.net/v4_6_release/apis/3.0/",
     "apiVersion": "",
     "companyId": "contoso",
     "publicKey": "<real public key>",
     "privateKey": "<real private key>",
     "clientId": "<real client id>",
     "pageSize": 100
   }
   ```
   or for Keka:
   ```json
   {
     "apiBaseUrl": "https://contoso.keka.com",
     "identityUrl": "https://login.keka.com",
     "tokenEndpoint": "/identity/token",
     "clientId": "<real client id>",
     "clientSecret": "<real client secret>",
     "apiKey": "<real api key>",
     "grantType": "client_credentials",
     "scope": "kekaapi"
   }
   ```
   **Save this file outside `ipaas.platform` entirely** (e.g. your Documents folder) — `*.credentials.json` is gitignored as a backstop, but don't rely on that alone for real secrets.

2. Run it, once per provider:
   ```powershell
   cd ipaas.orchestrationengine
   node scripts/seed-credentials.js <tenant_id> connectwise <path-to-connectwise-credentials.json>
   node scripts/seed-credentials.js <tenant_id> keka <path-to-keka-credentials.json>
   ```

3. **Delete both JSON files** once each command prints success. The secret is now encrypted (AES-256-GCM, `lib/crypto.js`) in the `credentials` table — the plaintext file has no further reason to exist.

## Step 4 — Mapping: usually nothing to do

If the tenant is fine with the platform's default field mapping (ConnectWise `Company` → canonical `client` → Keka `client`, the same mapping seeded once into `global_mapping_profiles` back in Prerequisites), **you don't need to do anything here.** `lib/mapping/profiles.js`'s resolution falls back to the global default automatically for any tenant with no `mapping_profiles` row of its own — see `ipaas.infra/docs/migrations/README.md`'s `global_mapping_profiles` section for the full resolution order.

Only add a tenant-specific override if this tenant genuinely needs different field mappings than every other tenant (e.g. a custom ConnectWise field, or a different Keka target field). There's no dedicated real-mapping seed script yet — `scripts/seed-mock-mapping.js` is the closest reference for the SQL shape (its mapping *rules* are real and reusable, only its *credentials* pairing with the mock server made it "mock"), but writing a tenant's actual override today means adapting that script's `INSERT INTO mapping_profiles` pattern by hand.

## Step 5 — Verify everything is in place

```sql
SELECT id, name FROM sync_entities WHERE id = '<sync_entity_id>';
SELECT provider, created_at FROM credentials WHERE tenant_id = '<tenant_id>';
```

You should see one `sync_entities` row and two `credentials` rows (one per provider) — no mapping row is expected unless you did Step 4's override.

## Step 6 — Trigger the first sync manually

There's no Provisioning Engine to do this automatically yet, so you run the real entrypoint by hand, exactly the way a container eventually will:

```powershell
cd ipaas.orchestrationengine
$env:SYNC_ENTITY_ID="<sync_entity_id>"; node lib/orchestration/run.js
```

Watch the logs for the fetch → map → validate → write pipeline, and check `sync_entities.status` afterward (`completed` or `failed`, since this is `one_time`):

```sql
SELECT status FROM sync_entities WHERE id = '<sync_entity_id>';
SELECT last_run_status, last_error, failed, retry FROM sync_state WHERE sync_entity_id = '<sync_entity_id>';
```

## What's still manual (not a gap in this doc — a gap in the platform)

- **No Provisioning Engine.** Nobody automatically creates containers, sets `interval` entities to `active`, or re-invokes the engine on a schedule. Every run today is a person setting `SYNC_ENTITY_ID` by hand.
- **No credential rotation flow.** To update a tenant's credentials later (a rotated key, a new secret), re-run `seed-credentials.js` — it upserts (`ON CONFLICT (tenant_id, provider) DO UPDATE`), so this doubles as the update path too. There's no expiry/rotation reminder system.
- **No UI.** Every step above is SQL or a script — there's no form for a tenant or an internal ops person to fill out yet.

## Related docs

- `ipaas.infra/docs/migrations/README.md` — full schema this runbook writes into
- `ipaas.orchestrationengine/docs/LLD-orchestration-engine.md` — engine internals, and the Provisioning Engine backlog item this runbook stands in for
- `ipaas.orchestrationengine/docs/DEMO-orchestration-engine.md` — the mock/demo equivalent of this walkthrough, for showing the engine's logic without real tenant data
- `ipaas.providers/docs/LLD-connector-auth-layer.md` — which adapter endpoints are actually verified vs. still guessed, before you promise a tenant `project`/`timesheet` support
