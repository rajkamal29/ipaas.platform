# Onboarding a New Tenant — Manual Runbook

This is what to actually do, today, when a real tenant asks for a ConnectWise↔Keka sync. There is no UI and no Provisioning Engine yet (both are still on the backlog — see `ipaas.orchestrationengine/docs/LLD-orchestration-engine.md`), so every step below is a person running a script or a SQL statement by hand. Nothing here is mock or demo data — this is the real path, for a real tenant. The one exception is Step 3: if you don't have this tenant's real credentials in hand yet, it covers a mock-credentials fallback so the rest of onboarding doesn't have to wait on them.

If you want to see the engine's logic working without a real tenant (e.g. for a demo), use `ipaas.orchestrationengine/docs/DEMO-orchestration-engine.md` instead — it's the same underlying steps, but with fake credentials pointed at a local mock server.

**Worked example used throughout this doc: OculusIT** — the same tenant `ipaas.orchestrationengine/docs/DEMO-orchestration-engine.md` already created, currently running on mock credentials seeded for that demo. This walkthrough picks up from exactly where things stand today: find the existing tenant/sync rows instead of creating new ones (Step 2), then swap in OculusIT's real ConnectWise/Keka credentials once they're in hand (Step 3) — until they are, Step 3's mock-credentials fallback describes OculusIT's actual current state, not a hypothetical.

Onboarding a genuinely different real tenant later? The same steps apply — use that tenant's own name and credentials, and take Step 2's "create a new tenant" path instead of the lookup path, since it won't exist yet.

## Prerequisites

Complete `docs/setup/DEVELOPER_SETUP.md` once first, if you haven't already — this runbook assumes Postgres is already running and migrated, and the platform-level mapping defaults are already seeded (`seed-global-mapping.js`, run from `ipaas.orchestrationengine`). That's a one-time thing per database, not per tenant, which is why it isn't repeated here — see Step 4 below for what it means for a tenant to inherit those defaults.

## Step 1 — Gather what you need from the tenant

Before touching Postgres, get these from OculusIT (or their ConnectWise/Keka admin):

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

**Don't have these yet, for one or both providers?** You don't have to wait on them to keep moving — see Step 3's "Don't have real credentials yet?" note, then come back here once they arrive.

## Step 2 — Find (or create) the tenant, sync request, and sync entity

Open psql:
```powershell
cd ipaas.infra
docker compose exec postgres psql -U ipaas -d ipaas_platform
```

**OculusIT already exists** — the demo docs created it. Look up its IDs instead of inserting new rows:

```sql
SELECT id AS tenant_id FROM tenants WHERE name = 'OculusIT' \gset
SELECT id AS sync_request_id FROM sync_requests WHERE tenant_id = :'tenant_id' AND source = 'connectwise' AND target = 'keka' \gset
SELECT id AS sync_entity_id FROM sync_entities WHERE sync_request_id = :'sync_request_id' AND entity = 'client' \gset

\echo Tenant:      :tenant_id
\echo SyncRequest: :sync_request_id
\echo SyncEntity:  :sync_entity_id
```

Write down all three IDs, then `\q` to exit.

**Onboarding a different real tenant, not OculusIT?** It won't exist yet, so create it instead:

```sql
INSERT INTO tenants (name) VALUES ('<real tenant name>') RETURNING id AS tenant_id \gset

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

Write down all three IDs here too, then `\q` to exit.

A couple of real decisions hide in that one `INSERT` into `sync_entities` (the "different tenant" path above), worth being deliberate about rather than copy-pasting blindly:

- **`sync_type`** — use `one_time` for anything you're going to trigger manually right now (see Step 6). `interval` is a valid value and the schema supports it, but nothing in this codebase currently re-invokes the engine on a schedule — that's the Provisioning Engine's job, and it isn't built yet. Setting `interval` today just means the entity sits there until someone manually re-runs it anyway, so there's no real difference from `one_time` in practice yet — pick `interval` only to signal "this should recur once the Provisioning Engine exists," not because it'll actually recur today.
- **`entity`** — only `'client'` is fully wired up (real mapping + a working canonical schema). `'project'` and `'timesheet'` are valid per the `CHECK` constraint, but neither adapter's endpoints for them are verified, and no canonical schema exists yet for either — see `ipaas.providers/docs/LLD-connector-auth-layer.md`. Don't onboard a tenant onto `project`/`timesheet` expecting it to actually sync yet.

## Step 3 — Insert credentials

**Don't have real credentials yet?** If you're standing up this tenant before the customer has actually handed over API access — for one provider or both — don't let the rest of onboarding wait on it. Run:

```powershell
cd ipaas.orchestrationengine
node scripts/seed-mock-credentials.js <tenant_id>
```

This seeds fake values pointed at the local mock server for **both** ConnectWise and Keka, letting you finish Steps 4–6 (mapping, verification, a test sync) in the meantime. Two things to know before using it this way:

- **It's only safe to run before any real credentials exist yet for either provider on this tenant.** It resets both providers to mock every time it runs — if you've already inserted a real credential for one side, running this again silently overwrites that real one back to mock too.
- **When a real credential for a provider does arrive, insert it using the real steps below for that provider only.** `seed-credentials.js` upserts on `(tenant_id, provider)`, so it replaces just that one provider's mock row and leaves the other provider's row — mock or real — untouched.

There's no flag in the `credentials` table marking a row mock vs. real, so track separately (a note against the tenant, a ticket, whatever you already use) which tenants are still running on mock credentials — see "What's still manual" below.

**Once you have real credentials for a provider:**

1. Create a JSON file with the fields you gathered in Step 1 — for ConnectWise:
   ```json
   {
     "baseUrl": "https://api-na.myconnectwise.net/v4_6_release/apis/3.0/",
     "apiVersion": "",
     "companyId": "oculusit",
     "publicKey": "<real public key>",
     "privateKey": "<real private key>",
     "clientId": "<real client id>",
     "pageSize": 100
   }
   ```
   or for Keka:
   ```json
   {
     "apiBaseUrl": "https://oculusit.keka.com",
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
SELECT id, entity, sync_type, status FROM sync_entities WHERE id = '<sync_entity_id>';
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
- **No mock/real credential marker.** The `credentials` table doesn't record how a row was seeded — a tenant running on Step 3's mock fallback looks identical, in a plain query, to one with real credentials. If you use that fallback, tracking which tenants are still pending real credentials is on you until this gets built.
- **No UI.** Every step above is SQL or a script — there's no form for a tenant or an internal ops person to fill out yet.

## Related docs

- `ipaas.infra/docs/migrations/README.md` — full schema this runbook writes into
- `ipaas.orchestrationengine/docs/LLD-orchestration-engine.md` — engine internals, and the Provisioning Engine backlog item this runbook stands in for
- `ipaas.orchestrationengine/docs/DEMO-orchestration-engine.md` — the mock/demo equivalent of this walkthrough, for showing the engine's logic without real tenant data
- `ipaas.providers/docs/LLD-connector-auth-layer.md` — which adapter endpoints are actually verified vs. still guessed, before you promise a tenant `project`/`timesheet` support
