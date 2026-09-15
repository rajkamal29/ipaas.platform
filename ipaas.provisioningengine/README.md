# iPaaS Provisioning Engine

Issue #18 establishes Clean Architecture and the production entity runtime contract.
**Database polling, automatic claiming, and recurring scheduling are not implemented.**

## Dependency direction

```text
workers / entry points -> application -> domain
bootstrap -> config + infrastructure + application + workers
infrastructure -> application ports + domain

src/
  domain/
    entities/             SyncEntity, SyncRequest
    enums/                Schema value sets
    value-objects/        Validated UUID identity
    errors/               Domain validation
  application/
    use-cases/            ProvisionSyncEntityUseCase
    dto/                  Runtime requests and typed results
    ports/repositories/   SyncEntityRepository, SyncRequestRepository
    ports/runtime/        RuntimeProvisioner, RuntimeImageResolver
    ports/logger.ts       Structured logging boundary
    errors/               Safe application/dependency errors
  infrastructure/
    persistence/postgres/ Row mapping, queries, pool, schema verification, repositories
    runtime/docker/       Dockerode boundary and deterministic runtime provisioning
    runtime/github/       Workflow dispatch adapter
    runtime-images/       Approved configuration-backed image resolution
    logging/              Structured JSON output
  config/                 All environment reads and validation
  workers/                Explicit work submission, in-flight deduplication/draining
  scripts/                Opt-in live verification and schema/image checks
  bootstrap.ts            Composition root and resource ownership
  index.ts                Explicit invocation and signal handling
```

Domain/application contain no PostgreSQL, Docker, GitHub, environment, filesystem, or
concrete logging dependencies. Tests enforce inward imports. There is no DI framework.

## Shared schema

Only `../ipaas.infra/migrations` owns the schema. This project has no migrations.
The compatibility verifier checks the required columns in all eight public tables:
tenants, sync_requests, sync_entities, credentials, sync_state, canonical_entities,
mapping_profiles, global_mapping_profiles. It checks column presence, not a complete
migration fingerprint or every database constraint.

Provisioning reads:

- sync_entities: id, sync_request_id, entity, sync_type, status, interval_seconds,
  created_at, updated_at.
- sync_requests: id, tenant_id, source, target, created_at.

Providers: connectwise, keka. Entities: client, project, timesheet.
Sync types: one_time, interval, real_time.
Lifecycle: submitted, provisioning, active, completed, failed.
Interval seconds are PostgreSQL integers >=60; other types require null.
No provider inequality, tenant-name, or additional platform schema rules are introduced.
Tenant credentials remain encrypted in credentials. Provisioning never reads them.
Execution results and cursors in sync_state are separate from provisioning lifecycle.

## Use case and lifecycle

`ProvisionSyncEntityUseCase.execute(syncEntityId)`:

1. Validates identity and loads the entity.
2. Returns without dispatch for active/completed entities.
3. Requires an explicitly claimed provisioning row. Submitted/failed rows are not
   automatically claimed or retried.
4. Loads its parent request, rejects real_time, and resolves an approved image from
   source/target.
5. Invokes the runtime port with syncEntityId and the schema schedule.
6. Changes provisioning to active only for a confirmed recurring-ready result.
7. Re-reads status to preserve concurrent orchestration outcomes.

The future #19 worker should claim rows atomically before calling this use case.
The repository provides conditional status updates without exposing SQL in its port.
This issue does not implement SELECT FOR UPDATE SKIP LOCKED or an automatic claim loop.

One-time launch/dispatch does not set completed. The existing Orchestration Engine owns
completed/failed after execution. A zero container exit code is not a business-success
signal: an unsuccessful cycle can still exit normally.

Definitive provisioning failures conditionally set provisioning -> failed. Ambiguous
dispatch outcomes, unexpected errors, and persistence failures after launch leave the
row for reconciliation. Errors expose safe codes/status-persistence information; raw
driver messages and response bodies are not exposed.

### Interval boundary

The current orchestration image executes one cycle and exits. Neither supplied adapter
installs a recurring trigger. Therefore Docker/GitHub adapters explicitly reject interval
provisioning rather than mark a one-off run active. The application supports and tests
interval provisioning through a recurring-ready runtime result. A real scheduler adapter
must implement that capability before intervals can be activated in production.
Scheduling/reconciliation is additional work beyond this architecture foundation.

## Runtime contract and idempotency

Runtime environment:

- SYNC_ENTITY_ID: sole orchestration identity.
- DATABASE_URL: shared platform connection, reachable from the runtime container.
- ENCRYPTION_MASTER_KEY: platform key; no individual tenant credentials.

No legacy integration/connector metadata DTOs remain in production.

Docker uses `ipaas-sync-<uuid>`, an identity label, configured network, no automatic
removal, and no restart policy. It pulls missing approved images. Only the invocation
that successfully creates a container owns its initial start. Docker's unique container
name creation semantics coordinate separate processes on the same daemon; a create
conflict does not grant start ownership. Existing created containers require operator
reconciliation, running containers are reused, and exited containers are never restarted
automatically. Dead or other unresolved states also require reconciliation. A creator
crash after creation may leave a created container that requires operator intervention. Identity/image/network/environment mismatches require operator reconciliation;
nothing is deleted automatically. Reusing a completed container is not a fresh execution
attempt. Explicit retries after failure require an externally coordinated reset/cleanup;
#19 must define that policy before enabling automatic retries.

GitHub dispatch sends only sync_entity_id and image_reference. HTTP acceptance is not
runtime readiness. Repeated dispatch may queue another workflow; workflow concurrency
and creator-only start prevent duplicate starts through this adapter while the same
container identity is retained on the same Docker host. This is not a distributed exactly-once guarantee across multiple runners/daemons.
GitHub Actions provisioning requires the selected self-hosted runner to reach the
intended Docker daemon. The runner must participate in or reach the expected platform
network where required; the daemon must provide the existing ipaas-network for runtime
containers, with connectivity to the shared database. The selector [self-hosted, Windows]
only selects eligible runners: deployment configuration must ensure it resolves to the
correct host. These are deployment prerequisites, not application-level idempotency
mechanisms. Configure runner eligibility before enabling this workflow.
External container deletion or manual starts bypass the adapter guarantee.

The root workflow runs the same application/Docker adapter, so it rechecks the row and
approved image. It never echoes platform secrets or container logs. The supplied image
must match the locally configured provider-pair image.

## Configuration

Use Node 24+. All environment reads are in src/config. No .env is loaded implicitly.
Set process environment or use `node --env-file=.env dist/index.js`.

| Variable                                           | Meaning                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| DATABASE_URL                                       | Required shared PostgreSQL connection                                  |
| RUNTIME_DATABASE_URL                               | Runtime-reachable URL for the same DB; defaults to DATABASE_URL        |
| ENCRYPTION_MASTER_KEY                              | Required base64 32-byte platform key                                   |
| RUNTIME_IMAGE_MAPPINGS_JSON                        | Required nonempty catalogue: source, target, registry, repository, tag |
| RUNTIME_PROVIDER                                   | docker (default) or github                                             |
| SYNC_ENTITY_ID                                     | Optional explicit provisioning work item                               |
| LOG_LEVEL                                          | debug/info/warn/error; default info                                    |
| DOCKER_SOCKET_PATH                                 | Platform socket default                                                |
| DOCKER_NETWORK                                     | Runtime network; default ipaas-network                                 |
| RUNTIME_TIMEOUT_MS                                 | Docker request timeout, 1000–600000 ms; default 120000                 |
| GITHUB_ACTIONS_API_BASE_URL                        | HTTPS API base; defaults to https://api.github.com                     |
| GITHUB_ACTIONS_OWNER / REPOSITORY / WORKFLOW / REF | Required for github mode                                               |
| GITHUB_TOKEN                                       | Required for github mode; never sent as workflow input                 |
| EXPECTED_RUNTIME_IMAGE                             | Workflow-only image assertion against the approved catalogue           |
| RUN_LIVE_VERIFICATION                              | Explicit opt-in for Docker/GitHub verification scripts                 |

Image registries are DockerHub/GHCR. Provider pairs must be unique. No mutable POC image
default is silently selected. Choose approved version tags and retain published images.
The schema allows provider pairs that currently lack executable adapters; image catalogue
approval is an operational deployment choice, not an invented database restriction.

Workflow configuration:

- Secrets PLATFORM_DATABASE_URL, PLATFORM_RUNTIME_DATABASE_URL, PLATFORM_ENCRYPTION_MASTER_KEY.
- Repository variable RUNTIME_IMAGE_MAPPINGS_JSON.
- A trusted self-hosted Windows runner with Docker, shared DB access, and ipaas-network.
- Workflow ref must contain the new contract before GitHub mode is used.

## Build and tests

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run db:verify-schema
```

Tests use Node's built-in runner and fakes; no PostgreSQL, Docker, GitHub, or environment
is needed for application tests. Infrastructure tests cover row mapping, conditional SQL,
Docker reuse/conflicts, GitHub payloads/errors, image resolution, and configuration.
Architecture tests prohibit outward dependencies, legacy identity, and polling.

## Local database and invocation

Start PostgreSQL only through the existing ipaas.infra setup, using its configured
environment and migrations. Do not start a second provisioning database.

```powershell
# From ipaas.infra, with its local configuration:
docker compose up -d postgres
npm ci
npm run migrate:up

# From ipaas.provisioningengine, with DATABASE_URL set:
npm run db:verify-schema
```

Schema verification needs only DATABASE_URL and optional LOG_LEVEL. No credentials
are printed. Provisioning additionally needs the runtime configuration above.

`npm start` validates startup and submits SYNC_ENTITY_ID if supplied. Without it, the
process verifies schema, reports that polling is absent, closes resources, and exits.
The worker has no heartbeat or polling timer. For an explicit containerized invocation,
use `docker compose run --rm provisioning-engine`; the Compose service does not restart.

SIGINT/SIGTERM stop admission and drain pending work before closing the pool. Repeated
shutdown calls share one promise. Startup failures also close the pool. Runtime containers
are independent workloads and are not stopped by shutting down the provisioning process.

## Verification utilities and POC cleanup

- docker:verify / github:verify: opt-in invocation using a real provisioning entity.
- registry:verify: resolve configured images without dispatch.
- db:verify-schema: read-only compatibility check.
- Removed random-ID one-time demo, legacy DTOs/service/ports, heartbeat-only worker,
  and workflow delete/recreate behavior.
- Moved schema and logging implementations into infrastructure; schema CLI into scripts.
- Former Docker/GitHub classes retain their useful behavior behind the new runtime port.
  Arbitrary container log retrieval is no longer part of the provisioning application port.

Do not enable automated retries, multiple runtime daemons, or interval activation before
the corresponding claim/reconciliation/scheduler policies are implemented and verified.
