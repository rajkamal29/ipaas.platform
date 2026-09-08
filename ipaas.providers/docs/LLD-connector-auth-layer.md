# LLD — Connector & Auth Layer

Status: Client entity implemented and verified live (`connectwise/index.js`, `keka/index.js`, this repo). Project and Timesheet extension is planned, not yet implemented — endpoints below are best guesses pending live verification (§4a, §5a).

## Revision history

1. Original draft assumed webhooks and Nango for Keka.
2. Revised to polling-only, Keka as a fully custom adapter, Client-only scope, after real credentials showed client-credentials-style auth.
3. Both connectors were called live (via a throwaway test script) and the design was revised to reflect confirmed real behavior — endpoint paths, field names, and pagination — instead of documented guesses. This also confirmed custom adapters over an OSS tool like Nango was still the right call for both systems, since neither involves an interactive OAuth consent step Nango would simplify. Implemented shortly after as `lib/adapters/connectwise.js` and `lib/adapters/keka.js`.
4. **This revision:** extending scope from Client-only to Project and Timesheet, following the same live-verification discipline as revision 3 — see §4a and §5a. Endpoints there are best guesses, not yet confirmed.

## 1. Purpose

Fetches and writes Client/Company data between ConnectWise and Keka, and securely stores/retrieves the credentials both systems need — via a uniform interface so the Orchestration Engine doesn't need to know it's talking to two differently-authenticated, differently-paginated systems.

## 2. Scope

**In scope:** a common connector adapter contract both systems implement; the ConnectWise adapter (API Member auth), covering Client (implemented) and Project/Time Entry (planned, §4a); the Keka adapter (client-credentials auth), covering Client (implemented) and Project/Timesheet (planned, §5a); pagination handling; how credentials get encrypted and persisted into `credentials`; surfacing clean, typed errors for the Orchestration Engine's retry policy.

**Out of scope:** webhook receivers; field mapping/transformation (Mapping & Transformation Engine); sync scheduling itself (Orchestration Engine — this layer only implements `fetch`/`write`, it doesn't decide when they run); the encryption algorithm's implementation code (defined here at the design level, written only once implementation is approved).

## 3. Connector Adapter Interface

| Method | Responsibility |
|---|---|
| `authenticate(connectorId)` | Ensure a valid token is available — for Keka, calls the token endpoint if the cached token has expired; for ConnectWise, a no-op |
| `fetch(entity, { pageNumber, pageSize, modifiedSince })` | Pull one page of records for an entity. Returns a **normalized shape regardless of which system it's calling**: `{ records: [...], pageNumber, totalPages, hasMore }`. The adapter is responsible for translating each system's own pagination mechanism into this shape — see §7. |
| `write(entity, record)` | Push a single target-shaped record to the system |

Page-aware, not "fetch everything internally" — confirmed as the right call now that both systems report a `totalPages`/page-count, meaning the Orchestration Engine can iterate pages as separate, checkpointed steps against `sync_state` (bounded execution time, resumable if one page fails) rather than one large blocking call.

## 4. ConnectWise Adapter — confirmed against a live call

| | |
|---|---|
| Auth type | `api_key` (API Member) — **confirmed working**, 200 response |
| Auth mechanism | `Authorization: Basic base64(companyId+publicKey:privateKey)` + `clientId` header |
| Endpoint (this iteration) | `GET {baseUrl}{apiVersion}/company/companies` → canonical Client |
| Pagination | Page-based via the `Link` response header (`rel="next"`, `rel="last"`) — e.g. `...?pageSize=1&page=2`. No page-count field in the body; the last page number comes from parsing `rel="last"` out of the header. |
| Incremental cursor | `_info.lastUpdated` on each record (ISO 8601) — use as the modified-since watermark |
| Real fields observed | `id, identifier, name, status{id,name}, addressLine1, addressLine2, city, state, zip, country{...}, phoneNumber, website, types[{...}], site{...}, _info{lastUpdated, updatedBy, dateEntered, contacts_href, ...}` |
| **Known gap** | Primary contact name/email is **not embedded** in the Company record — it's a separate resource at `_info.contacts_href`. Decision needed: a second API call per company, or leave canonical `primaryContactName`/`primaryContactEmail` null for this POC (they're already optional in the draft canonical schema, so leaving them null doesn't break anything — recommend this for now, revisit if the demo needs contact data). |

## 4a. ConnectWise Adapter — Project & Time Entry (planned, pending live verification)

| | |
|---|---|
| Status | Not implemented. Endpoints below are best guesses, following the same `{module}/{resource}` shape confirmed for Client (`company/companies`) — not yet run against the real API. |
| Endpoint guess — Project | `GET {baseUrl}{apiVersion}/project/projects` → canonical Project |
| Endpoint guess — Time Entry | `GET {baseUrl}{apiVersion}/time/entries` → canonical Timesheet |
| Auth, pagination, incremental cursor | Assumed identical mechanism to Client (§4) — Basic auth + `clientId` header, `Link`-header pagination, `_info.lastUpdated` cursor — since this is the same ConnectWise API, just a different resource. Not yet confirmed these assumptions hold for these two resources specifically. |
| Verification plan | `scripts/test-connectivity.js` extended with a probe per resource, run locally (this sandbox's network egress can't reach ConnectWise), output pasted back and this section updated with confirmed endpoint, real field names, and pagination behavior before any adapter code is written. |
| Known dependency | Project records are expected to carry a ConnectWise-side reference back to their parent Company — needed so the canonical Project schema can carry a `clientId` field. Confirm the actual field name for this once real data is available. |

## 5. Keka Adapter — confirmed against a live call

| | |
|---|---|
| Auth type | `client_credentials`-style — **confirmed working**, token issued |
| Auth mechanism | `POST {identityUrl}{tokenEndpoint}` form-urlencoded with `client_id, client_secret, api_key, grant_type, scope` → `{ access_token, expires_in, token_type, scope }`. Response included `expires_in: 86400` (seconds) — store `tokenExpiresAt = now + expires_in`, not an absolute timestamp from the response itself. |
| Gotcha confirmed in Keka's own docs | Some clients need a `User-Agent` header (e.g. `Mozilla`) on requests or calls error out — included defensively in the adapter. |
| Endpoint (this iteration) | `GET {apiBaseUrl}/api/v1/psa/clients` → canonical Client |
| Pagination | Page-based via body fields — `pageNumber`, `pageSize`, `totalPages`, `totalRecords`, plus ready-made `nextPage`/`previousPage` URLs |
| Incremental cursor | `lastModified` query parameter is documented as filterable — use for the modified-since watermark, same role as ConnectWise's `_info.lastUpdated` |
| Real fields observed | `id, name, billingName, code, description, billingAddress{addressLine1,addressLine2,countryCode,city,state,zip}, clientContacts[{id,clientId,name,email,phone}], additionalFields[{id,title,value}]` |

## 5a. Keka Adapter — Project & Timesheet (planned, pending live verification)

| | |
|---|---|
| Status | Not implemented. Endpoints below are best guesses — not yet run against the real API. |
| Endpoint guess — Project | `GET {apiBaseUrl}/api/v1/psa/projects` → canonical Project — same shape as the confirmed `/api/v1/psa/clients`. |
| Endpoint guess — Timesheet | Lower confidence than Project. Two candidates to probe: `/api/v1/psa/timesheets` (same `/psa/` family as Client and Project) and `/api/v1/time/entries` (Keka is primarily an HR platform, so time tracking may live outside the `/psa/` namespace entirely). Verification will confirm which, if either, is correct. |
| Auth, pagination, incremental cursor | Assumed identical to Client (§5) — same bearer token, same `pageNumber`/`totalPages` body pagination, same `lastModified` cursor param — not yet confirmed for these two resources. |
| **write() risk — carries over from Client** | Client's `write()` (§5, `KekaAdapter.write`) is itself still unverified against the real API — the code comment in `keka/index.js` (this repo) flags this explicitly. Extending `write()` to Project/Timesheet on the same unverified assumption compounds that risk. Recommend verifying Client's `write()` live at the same time as this extension, not after. |
| Verification plan | Same extended `scripts/test-connectivity.js` run as §4a — output pasted back, this section updated with confirmed endpoint and real field names before any adapter code is written. |
| Known dependency | Timesheet records are expected to carry a Keka-side reference to their parent Project — needed for the canonical Timesheet schema's `projectId` field. Confirm the actual field name once real data is available. |

## 6. Credential Storage & Acquisition Flow

**Postgres only — no connector credentials are ever stored in `.env`.** `.env` holds only platform bootstrap secrets: the Postgres connection and `ENCRYPTION_MASTER_KEY`, the key used to encrypt everything below.

The `credentials` table holds the actual per-connector config and secrets: one row per `(tenant_id, provider)` (unique constraint enforced), ciphertext/IV/auth tag stored as three separate columns (AES-256-GCM) rather than bundled into one blob. Full column list: `ipaas.infra/docs/migrations/README.md`'s `credentials` section.

**Acquisition flow:**
1. Real credentials are gathered into a JSON file matching the shape each adapter's constructor expects, then encrypted and inserted via `ipaas.orchestrationengine/scripts/seed-credentials.js <tenant_id> <provider> <path-to-json>` (see `docs/setup/TENANT_ONBOARDING.md`) — upserts on `(tenant_id, provider)`, so re-running it is also how a rotated credential gets updated. For local/mock development, `scripts/seed-mock-credentials.js <tenant_id>` does the same thing with fake values pointed at the mock server — no JSON file, no real account needed.
2. The plaintext JSON file is deleted once the script confirms success — the only copy of the secret from then on is the encrypted row in Postgres.
3. At runtime, an adapter decrypts its connector's row in memory. For Keka, the refreshed `accessToken`/`tokenExpiresAt` are written back into the same encrypted row after each token refresh.

## 7. Pagination & Sync Trigger

No webhook receiver — the Orchestration Engine drives fetching, on a schedule or manually for one-time push. Concretely, for a full sync of an entity:

1. Orchestration Engine calls `fetch(entity, { pageNumber: 1, pageSize: 100, modifiedSince: <last watermark> })`.
2. Adapter normalizes the response — for ConnectWise, parses `totalPages` out of the `Link` header; for Keka, reads `totalPages` directly from the body — and returns `{ records, pageNumber, totalPages, hasMore }`.
3. Orchestration Engine processes that page's records (via the Mapping Engine), then calls `fetch()` again for `pageNumber + 1` if `hasMore`, checkpointing progress to `sync_state` after each page so a crash mid-run is resumable.
4. After the last page, `sync_state.cursor` is updated to the latest `lastUpdated`/`lastModified` value seen, for the next run's incremental fetch.

## 8. Integration Points

- **Data & Secrets Store** — reads/writes the encrypted `credentials` row for each connector; Orchestration Engine reads/writes `sync_state` for the pagination/incremental cursor.
- **Mapping & Transformation Engine** — receives this layer's raw fetched records (one page at a time); returns target-shaped records for this layer to write.
- **Orchestration Engine** — drives the page-by-page fetch loop described in §7 and owns retry policy per page. This layer throws typed errors (auth failure, rate limit, not-found) rather than retrying internally.

## 9. Open Items

- **ConnectWise rate limits** — not yet tested under real load; confirm before scheduled-sync polling frequency is finalized.
- **ConnectWise primary-contact gap** — decision and recommendation in §4's "Known gap" row.
- **Live verification for Project/Timesheet** — verification plan in §4a and §5a.
- **Keka `write()` still unverified against the real API** — risk noted in §5a's "write() risk" row.
- **Parent-reference field names** (Project → Company, Timesheet → Project) — needed for canonical `clientId`/`projectId` fields (see `LLD-mapping-engine.md`); tracked in §4a's and §5a's "Known dependency" rows.
