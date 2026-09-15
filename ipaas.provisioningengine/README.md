# IPAAS Provisioning Engine

TypeScript control-plane foundation for starting IPAAS Orchestration Engine runtimes.
This module consumes the shared platform database owned by `../ipaas.infra`; it does not
own a separate database or a private copy of the platform schema.

## Platform database contract

The authoritative schema and migrations live in `../ipaas.infra/migrations`. The shared
database contains eight tables:

- `tenants`: tenant identity.
- `sync_requests`: a tenant's source-to-target provider pair.
- `sync_entities`: independently provisioned entity and its sync type, cadence, and lifecycle status.
- `credentials`: encrypted credentials per tenant and provider.
- `sync_state`: latest cursor, run outcome, failed records, and retry records for one entity.
- `canonical_entities`: versioned canonical JSON schemas.
- `mapping_profiles`: tenant-specific provider/entity mappings.
- `global_mapping_profiles`: platform mapping defaults.

Provisioning is scoped to one `sync_entities.id`. The Orchestration Engine is invoked with
`SYNC_ENTITY_ID` and loads its tenant, provider pair, credentials, mappings, and state from
PostgreSQL. `one_time` and `interval` belong to the batch engine; `real_time` must eventually
be routed to a separate event-driven engine.

The Provisioning Engine is expected to own the provisioning portion of the lifecycle:

```text
submitted -> provisioning -> active       (interval)
                          \-> completed    (one_time, written by Orchestration Engine)
                          \-> failed
```

Run health is separate from lifecycle status and belongs in `sync_state`.

## Prerequisites

- Node.js 24 or newer
- npm
- Docker Desktop
- Shared PostgreSQL from `../ipaas.infra`

## Install and verify

```powershell
cd ipaas.provisioningengine
npm ci
npm run typecheck
npm test
npm run build
```

## Shared database setup

Start and migrate PostgreSQL from its owning module:

```powershell
cd ../ipaas.infra
docker compose up -d
npm ci
npm run migrate:up
```

Set the same connection string in the Provisioning Engine process, then check that the
database has all required platform tables and columns:

```powershell
cd ../ipaas.provisioningengine
$env:DATABASE_URL = "postgres://ipaas:<password>@localhost:5432/ipaas_platform"
npm run db:verify-schema
```

Do not add schema migrations here. Add platform schema changes to `ipaas.infra`, then
update this module's compatibility check only when the Provisioning Engine depends on them.

## Configuration

The application reads environment variables directly and does not load `.env` files.
`.env.example` contains non-secret examples.

- `LOG_LEVEL`: `debug`, `info`, `warn`, or `error`; defaults to `info`.
- `STATUS_LOG_INTERVAL_MS`: positive heartbeat interval; defaults to `60000`.
- `DATABASE_URL`: connection to the shared `ipaas_platform` database.
- `ENCRYPTION_MASTER_KEY`: passed to Orchestration Engine containers; must match that engine's key.
- `RUNTIME_IMAGE_MAPPINGS_JSON`: approved source/target image mappings. The default covers
  the currently executable ConnectWise-to-Keka direction using the shared Orchestration
  Engine image. Keka-to-ConnectWise is not approved yet because ConnectWise writes are not implemented.
- `DOCKER_SOCKET_PATH`: Docker Engine socket.
- `GITHUB_ACTIONS_*` and `GITHUB_TOKEN`: GitHub workflow-dispatch settings.

## Run locally

The current worker is lifecycle-only: it logs startup and health but does not yet claim
`sync_entities` rows.

```powershell
npm run build
npm start
```

## Run with Docker Compose

First start `ipaas.infra`; it creates the external Docker network `ipaas-network`. Then:

```powershell
cd ../ipaas.infra
docker compose up -d

cd ../ipaas.provisioningengine
$env:POSTGRES_PASSWORD = "<same password as ipaas.infra/.env>"
$env:ENCRYPTION_MASTER_KEY = "<same key as ipaas.orchestrationengine/.env>"
docker compose up -d --build
docker compose logs provisioning-engine
```

The service reaches PostgreSQL as `ipaas-postgres`. It mounts the Docker socket for the
direct Docker POC path; this grants powerful host access and is not a production security model.

## Existing POC capabilities

- Resolve an approved Docker Hub or GHCR image from a source/target pair.
- Create, start, inspect, and read logs from a local Docker container.
- Dispatch the repository-root `../.github/workflows/provision-runtime.yml` through GitHub Actions.
- Validate the shared platform schema with `npm run db:verify-schema`.
- Structured JSON logging and graceful shutdown.

Verification scripts remain available:

```powershell
npm run docker:verify
npm run github:verify
npm run registry:verify
npm run demo:one-time
```

Live GitHub scripts run only when `RUN_GITHUB_INTEGRATION_TESTS=true`.

## Work still required

The copied POC is not yet a complete platform Provisioning Engine. The next application work is to:

1. Atomically claim supported `sync_entities` rows in `submitted` state.
2. Join through `sync_requests` to resolve the correct batch runtime image.
3. Provision one invocation per `sync_entities.id` and pass `SYNC_ENTITY_ID`, `DATABASE_URL`,
   and `ENCRYPTION_MASTER_KEY` without exposing tenant credentials.
4. Set `interval` entities to `active` once recurring invocation is established.
5. Avoid routing `real_time` rows to the batch Orchestration Engine.
6. Persist provisioning failures and implement safe retry/idempotency behavior.

The current Docker/GitHub request models and root workflow intentionally retain the
standalone POC metadata shape (`INTEGRATION_ID`, `TENANT_ID`, connector names, and
`SYNC_MODE`). The database-polling worker is the component that will obtain a real
`sync_entities.id`; that feature must replace the temporary contract with `SYNC_ENTITY_ID`.
The legacy fields are not an alternative database schema and must not become the production
Orchestration Engine contract.

## Architecture

```text
index.ts -> bootstrap.ts -> infrastructure adapters
                              |
                              v
                     application ports/models
                              ^
                              |
                    ProvisioningService facade
```

`bootstrap.ts` is the production composition root. Application code depends on ports;
Docker, GitHub, PostgreSQL, and runtime-image configuration are adapters behind them.
