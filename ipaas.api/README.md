# iPaaS API

TypeScript and Express API for tenant and sync configuration. PostgreSQL schema ownership remains in `../ipaas.infra`; this project never runs or duplicates migrations in production.

## Architecture

The source uses common Clean Architecture layers:

```text
src/domain          Business models and values; no outer-layer dependencies
src/application     Use cases, input/filter/output contracts, validation, errors, and repository ports
src/infrastructure  PostgreSQL repositories, SQL, database rows, and persistence mappers
src/api             Express routes/controllers/middleware and public HTTP DTOs
src/config          Environment configuration
src/shared          Framework-independent cross-cutting ports
```

Dependencies point inward:

```text
API -> Application -> Domain
Infrastructure -> Application/Domain
```

Application use cases expose application-owned input and output contracts.
Infrastructure implements application-owned repository ports and maps PostgreSQL
rows into domain models. API response mappers convert application outputs into
public HTTP DTOs. `src/server.ts` is the composition root; `src/app.ts` assembles
the Express boundary.

## Configuration

Copy `.env.example` to `.env` and set `DATABASE_URL` and
`ENCRYPTION_MASTER_KEY`. The encryption key must be the same base64-encoded
32-byte key used by the orchestration engine. `PORT` defaults to `3000`;
`NODE_ENV` defaults to `development`. Invalid startup configuration fails before
the server listens.

## HTTP contract

- Success: `200` for GET/PUT and `201` for POST.
- Validation: `422` with `{ error: { code, message, details, requestId } }`.
- Malformed JSON: `400`.
- Missing or incorrectly nested resources: `404`.
- Unique conflicts: `409`.
- Unexpected errors: generic `500`; details are logged server-side with the response request ID.

Successful resource responses use a minimal envelope generated when the API
creates the response:

```json
{
  "data": {},
  "timestamp": "2026-09-15T10:30:45.123Z"
}
```

List responses use the same contract with an array:

```json
{
  "data": [],
  "timestamp": "2026-09-15T10:30:45.123Z"
}
```

Errors retain their separate envelope:

```json
{
  "error": {
    "code": "validation",
    "message": "Invalid request payload.",
    "details": [],
    "requestId": "00000000-0000-4000-8000-000000000000"
  }
}
```

Domain models and application output contracts are not public HTTP contracts.
Explicit API response DTOs define the fields exposed by resource endpoints.
`X-Request-ID` provides request correlation and is intentionally not duplicated
in successful response bodies. The response `timestamp` is the ISO-8601 time at
which the API generated the HTTP response. Operational `/health` and `/ready`
probes retain their existing `{ "status": "..." }` responses.

Implemented resources:

```text
GET, POST       /api/tenants
GET, PUT        /api/tenants/:tenantId
GET, POST       /api/tenants/:tenantId/sync-requests
GET, PUT        /api/tenants/:tenantId/sync-requests/:requestId
GET, POST       /api/tenants/:tenantId/sync-requests/:requestId/entities
GET, PUT        /api/tenants/:tenantId/sync-requests/:requestId/entities/:entityId
GET, POST       /api/tenants/:tenantId/credentials
GET             /api/tenants/:tenantId/credentials/:provider
GET             /api/canonical-entities
GET             /api/canonical-entities/:canonicalEntityId
GET, POST       /api/global-mapping-profiles
GET, PUT        /api/global-mapping-profiles/:profileId
POST            /api/global-mapping-profiles/:profileId/activate
GET, POST       /api/tenants/:tenantId/mapping-profiles
GET             /api/tenants/:tenantId/mapping-profiles/effective
GET, PUT        /api/tenants/:tenantId/mapping-profiles/:profileId
POST            /api/tenants/:tenantId/mapping-profiles/:profileId/activate
GET             /health
GET             /ready
```

Credential responses expose configuration metadata only. Plaintext secrets,
ciphertext, IVs, and authentication tags are never part of the HTTP contract.
Mapping profiles keep provider-specific `fieldMappings` separate from canonical
entity JSON schemas. Effective mapping resolution checks the active tenant
profile first, then the active global profile, and otherwise returns the explicit
missing representation. Issue #12 adds no DELETE endpoints.

PUT bodies fully replace mutable fields. Unknown and immutable fields are rejected. Sync Entity lists return all entities belonging to the requested Sync Request; server-side entity/status/sync-type filtering is not part of Issue #11. No ordering or pagination is promised.

## Development and validation

```powershell
npm install
npm run typecheck
npm run build
npm run lint
npm run format:check
npm run test:unit
npm run test:http
```

Integration tests run the unchanged migrations in `../ipaas.infra/migrations` into an isolated schema and remove that schema afterward:

```powershell
$env:TEST_DATABASE_URL='<dedicated-or-local-test-postgres-url>'
npm run test:integration
```

Without `TEST_DATABASE_URL`, the integration suite is reported as skipped rather than connecting to an unintended database.
