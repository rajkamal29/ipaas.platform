# IPAAS Provisioning Engine Technical Overview

## 1. Purpose

The IPAAS Provisioning Engine is the control-plane component responsible for starting
Orchestration Engine workloads. It does not perform provider synchronization itself.
Instead, it selects an approved runtime image and delegates runtime creation to Docker or
GitHub Actions.

The current code is a proof-of-concept foundation. Image resolution, Docker provisioning,
GitHub workflow dispatch, configuration, logging, graceful shutdown, and shared-database
schema verification are implemented. Database polling, work claiming, lifecycle updates,
scheduling, and the final `SYNC_ENTITY_ID` runtime contract are planned but not yet implemented.

## 2. Position in the IPAAS Platform

```text
Client or API Layer
        |
        v
Shared PostgreSQL database (owned by ipaas.infra)
        |
        v
Provisioning Engine
        |
        +--------------------+
        |                    |
        v                    v
Local Docker          GitHub Actions
        |                    |
        +---------+----------+
                  |
                  v
        Orchestration Engine invocation
                  |
                  v
         Provider fetch -> map -> write
```

The repository modules have separate responsibilities:

| Module | Responsibility |
|---|---|
| `ipaas.infra` | PostgreSQL container and authoritative schema migrations |
| `ipaas.providers` | ConnectWise and Keka provider adapters |
| `ipaas.orchestrationengine` | Executes one synchronization cycle for one entity |
| `ipaas.provisioningengine` | Selects and starts the appropriate runtime |
| `ipaas.ui` | Platform user interface |

## 3. Current runtime behavior

Running the application currently starts a lifecycle-only worker:

```text
npm start
   |
   v
src/index.ts
   |
   v
composeApplication()
   |
   v
ProvisioningWorker.start()
   |
   +-- log startup
   +-- emit debug heartbeats
   +-- wait for SIGINT or SIGTERM
```

The worker does not currently query `sync_entities` or invoke `ProvisioningService`.
Provisioning operations are exercised through verification scripts and direct application calls.

## 4. Architectural style

The project uses ports and adapters, also called hexagonal architecture.

```text
Entry points -> Application service -> Application ports <- Infrastructure adapters
```

Application code defines the capabilities it needs as TypeScript interfaces. Infrastructure
classes implement those interfaces using Docker, GitHub, PostgreSQL, or configuration.
`src/bootstrap.ts` is the composition root that constructs concrete adapters and injects
them into the application service.

This structure keeps technology-specific dependencies out of the application layer and
allows unit tests to use in-memory fakes.

## 5. Project structure

```text
ipaas.provisioningengine/
|-- src/
|   |-- application/
|   |   |-- errors/           Application-specific error types
|   |   |-- models/           Provisioning and deployment request/result types
|   |   |-- ports/            Infrastructure-independent interfaces
|   |   `-- provisioning-service.ts
|   |-- config/               Environment configuration and image catalogue parsing
|   |-- database/             Shared-schema verification entry point
|   |-- infrastructure/
|   |   |-- docker/           Dockerode client and container adapter
|   |   |-- github/           GitHub workflow-dispatch adapter
|   |   |-- postgres/         PostgreSQL client and schema verifier
|   |   `-- runtime-images/   Configuration-backed image resolver
|   |-- logging/              Structured JSON logger
|   |-- scripts/              Manual verification and demo entry points
|   |-- workers/              Long-running worker lifecycle
|   |-- bootstrap.ts          Production dependency composition
|   `-- index.ts              Main process entry point and shutdown handling
|-- tests/
|   |-- application/          Application-service tests
|   |-- database/             Shared-schema verifier tests
|   `-- provisioning/         Docker, GitHub, and resolver tests
|-- docs/                     Provisioning Engine technical documentation
|-- Dockerfile                Multi-stage production image
|-- docker-compose.yml        Provisioning service connected to ipaas-network
|-- package.json              Commands and dependencies
|-- tsconfig.json             Production TypeScript configuration
`-- tsconfig.test.json        Test compilation configuration
```

The GitHub provisioning workflow lives at the monorepo root:

```text
.github/workflows/provision-runtime.yml
```

GitHub does not discover workflows stored inside a nested module's `.github` directory.

## 6. Application entry points

### `src/index.ts`

The production entry point composes the application, starts the worker, and registers
single-use `SIGINT` and `SIGTERM` handlers. Shutdown is idempotent, so receiving multiple
signals does not stop the worker more than once.

### `src/bootstrap.ts`

`composeApplication()` constructs:

1. Environment configuration.
2. Structured logger.
3. Runtime-image resolver.
4. Docker client and container provisioner.
5. GitHub Actions deployment trigger.
6. `ProvisioningService`.
7. `ProvisioningWorker`.

Infrastructure objects are passed to `ProvisioningService` through application ports.

## 7. ProvisioningService

`ProvisioningService` is the application facade. It supports two paths.

### Local provisioning

```text
provisionLocally(request)
        |
        v
Resolve approved image from source/target
        |
        v
ContainerProvisioner.provision()
        |
        v
Create -> start -> inspect Docker container
```

### GitHub deployment

```text
triggerDeployment(request)
        |
        v
Resolve approved image from source/target
        |
        v
DeploymentTrigger.trigger()
        |
        v
POST GitHub workflow_dispatch
```

The service does not decide which path should be used. Its caller selects local Docker or
GitHub Actions.

## 8. Runtime image resolution

Runtime images are selected from an allowlist rather than accepted directly from an
untrusted request. The default production mapping is:

```text
connectwise -> keka -> ghcr.io/rajkamal29/ipaas-orchestration-engine:dev-latest
```

Keka-to-ConnectWise is not enabled because `ConnectWiseAdapter.write()` is not implemented.
The resolver supports Docker Hub and GHCR and compares connector and registry identifiers
case-insensitively.

Mappings can be overridden with `RUNTIME_IMAGE_MAPPINGS_JSON`. Each entry requires:

```json
{
  "sourceConnector": "connectwise",
  "destinationConnector": "keka",
  "registry": "GHCR",
  "repository": "rajkamal29/ipaas-orchestration-engine",
  "tag": "dev-latest"
}
```

Unsupported connector pairs raise `RuntimeImageNotFoundError`. Unsupported registries raise
`UnsupportedRuntimeImageRegistryError`.

## 9. Docker adapter

`DockerContainerProvisioner` uses Dockerode through a small internal `DockerClient` interface.
It can:

- Create and start a container.
- Inspect a container.
- Retrieve and decode Docker logs.
- Wrap Docker failures in `ContainerProvisioningError`.

The socket defaults are:

```text
Windows:      //./pipe/docker_engine
Linux/macOS: /var/run/docker.sock
```

The direct Docker adapter currently assumes the image already exists locally. Automatic
image pulling should be added to the Docker infrastructure layer as part of the worker
implementation. The GitHub workflow already checks and pulls missing images.

## 10. GitHub Actions adapter and workflow

`GitHubActionsDeploymentTrigger` calls:

```text
POST /repos/{owner}/{repository}/actions/workflows/{workflow}/dispatches
```

Current defaults target:

```text
Owner:      rajkamal29
Repository: ipaas.platform
Workflow:   provision-runtime.yml
Ref:        dev
```

The root workflow runs on a self-hosted Windows runner. It validates the request, checks
Docker, pulls a missing image, replaces an existing POC container with the same name,
starts a container, inspects it, and displays its logs.

GitHub normally returns HTTP 204 for a successful dispatch without a workflow run ID. A
successful dispatch therefore means the request was accepted, not that provisioning completed.

## 11. Temporary and target runtime contracts

The copied POC currently passes these values to a runtime:

```text
INTEGRATION_ID
TENANT_ID
SOURCE_CONNECTOR
DESTINATION_CONNECTOR
SYNC_MODE
```

This contract is temporary. The platform Orchestration Engine accepts one tenant-scoped input:

```text
SYNC_ENTITY_ID
```

It then loads the parent request, tenant, credentials, mapping profiles, and execution state
from PostgreSQL. The database-polling worker will be the first component with a real
`sync_entities.id`, so the contract change is intentionally deferred to that feature.

Platform secrets required by an Orchestration Engine invocation are:

```text
DATABASE_URL
ENCRYPTION_MASTER_KEY
```

Tenant credentials must remain encrypted in PostgreSQL and must not be passed through
container environment variables.

## 12. Shared database schema

The authoritative schema lives in `../ipaas.infra/migrations`. The Provisioning Engine does
not create or migrate a separate database.

```text
tenants (1) --< sync_requests (1) --< sync_entities (1) -- (1) sync_state
    |
    +--< credentials
    +--< mapping_profiles

canonical_entities
global_mapping_profiles
```

### `tenants`

Stores tenant identity with UUID `id`, unique `name`, and `created_at`.

### `sync_requests`

Stores a tenant's `source` and `target` provider pair. Request-level status is deliberately
not stored because entity states may differ.

### `sync_entities`

The unit of provisioning and scheduling. Each row contains `entity`, `sync_type`, `status`,
and optional `interval_seconds`.

Allowed sync types:

```text
one_time
interval
real_time
```

Allowed lifecycle states:

```text
submitted
provisioning
active
completed
failed
```

An interval requires `interval_seconds >= 60`; other types require it to be null.

### `credentials`

Stores AES-256-GCM encrypted provider credentials per tenant and provider using separate
ciphertext, IV, and authentication-tag columns.

### `sync_state`

Stores the latest cursor, run outcome, error, data failures, and retryable technical failures
for one `sync_entities` row. It represents run health, not provisioning lifecycle.

### Mapping tables

`canonical_entities` stores versioned JSON schemas. `mapping_profiles` stores tenant-specific
mappings, while `global_mapping_profiles` provides defaults inherited by tenants without an override.

## 13. Schema compatibility verification

Run migrations only from the schema owner:

```powershell
cd ../ipaas.infra
npm run migrate:up
```

Then verify the Provisioning Engine contract:

```powershell
cd ../ipaas.provisioningengine
$env:DATABASE_URL = "postgres://ipaas:<password>@localhost:5432/ipaas_platform"
npm run db:verify-schema
```

`verifyPlatformSchema()` queries `information_schema.columns` and verifies all eight platform
tables and their required columns. It is read-only and does not verify polling or status updates.

## 14. Intended worker design

The next worker implementation should follow this flow:

```text
Poll supported sync_entities in submitted state
        |
        v
Atomically claim one row
        |
        v
Set status to provisioning
        |
        v
Join sync_requests and resolve approved runtime image
        |
        v
Ensure image is available
        |
        v
Launch one runtime with SYNC_ENTITY_ID
        |
        +-- interval: establish recurrence and set active
        +-- one_time: Orchestration Engine writes completed or failed
        +-- provisioning failure: persist failed status and reason
```

Claiming should use a transaction and a concurrency-safe PostgreSQL technique such as
`FOR UPDATE SKIP LOCKED` so multiple workers cannot process the same entity.

`real_time` rows must not be sent to the batch Orchestration Engine.

## 15. Configuration reference

| Variable | Required | Purpose |
|---|---:|---|
| `LOG_LEVEL` | No | Minimum JSON log level; defaults to `info` |
| `STATUS_LOG_INTERVAL_MS` | No | Worker heartbeat interval; defaults to 60000 |
| `DATABASE_URL` | For DB operations | Shared `ipaas_platform` connection string |
| `ENCRYPTION_MASTER_KEY` | Future runtime launch | Same key used by the Orchestration Engine |
| `RUNTIME_IMAGE_MAPPINGS_JSON` | No | Overrides approved runtime mappings |
| `DOCKER_SOCKET_PATH` | No | Docker Engine socket |
| `GITHUB_ACTIONS_API_BASE_URL` | For dispatch | Normally `https://api.github.com` |
| `GITHUB_ACTIONS_OWNER` | For dispatch | Defaults to `rajkamal29` |
| `GITHUB_ACTIONS_REPOSITORY` | For dispatch | Defaults to `ipaas.platform` |
| `GITHUB_ACTIONS_WORKFLOW` | For dispatch | Defaults to `provision-runtime.yml` |
| `GITHUB_ACTIONS_REF` | For dispatch | Defaults to `dev` |
| `GITHUB_TOKEN` | For dispatch | Token with Actions write permission |

The application does not load `.env` files. Export variables into the process environment.

## 16. Local setup and verification

```powershell
# Shared database
cd ../ipaas.infra
docker compose up -d
npm ci
npm run migrate:up

# Provisioning Engine
cd ../ipaas.provisioningengine
npm ci
npm run typecheck
npm test
npm run build
```

Set the shared connection and verify it:

```powershell
$env:DATABASE_URL = "postgres://ipaas:<password>@localhost:5432/ipaas_platform"
npm run db:verify-schema
```

Run the lifecycle worker with visible heartbeats:

```powershell
$env:LOG_LEVEL = "debug"
$env:STATUS_LOG_INTERVAL_MS = "5000"
npm start
```

Run the live Docker adapter check:

```powershell
docker pull hello-world:latest
npm run docker:verify
```

The `hello-world` container exits normally after printing its message. Remove the stopped
verification container after the test.

## 17. Test coverage

The project uses the Node.js built-in test runner. Current coverage verifies:

- Image resolution for GHCR and explicit test-only Docker Hub mappings.
- Case-insensitive connector and registry matching.
- Unsupported mapping and registry errors.
- ProvisioningService delegation.
- Docker create/start request construction, inspection, logs, and error wrapping.
- GitHub endpoint, ref, inputs, configuration errors, HTTP failures, and responses.
- Shared-schema acceptance and missing-column reporting.

Run all automated checks with:

```powershell
npm test
npm run typecheck
npm run build
```

## 18. Current limitations

- The worker does not poll PostgreSQL.
- No entity is atomically claimed.
- Provisioning lifecycle statuses are not updated.
- Interval recurrence is not scheduled.
- The direct Docker adapter does not pull missing images.
- The temporary runtime contract has not been replaced with `SYNC_ENTITY_ID`.
- Live GitHub dispatch requires external credentials and a self-hosted runner.
- The Orchestration Engine image must be published before the configured GHCR mapping can run.
- ConnectWise target writes are not implemented, so reverse synchronization is not approved.

These limitations are implementation backlog, not capabilities provided by the current POC.

## 19. Security and operational considerations

- Never commit `.env`, GitHub tokens, database passwords, encryption keys, or provider credentials.
- Docker socket access effectively grants control of the host Docker Engine.
- Use pinned immutable image tags for production rather than a moving `dev-latest` tag.
- Keep schema migrations centralized in `ipaas.infra`.
- Add idempotency and concurrency protection before running multiple workers.
- Do not treat HTTP 204 from GitHub as proof that the provisioned workload completed.
- Keep tenant credentials in the encrypted `credentials` table.

## 20. Recommended next implementation sequence

1. Add a repository port for claiming and updating `sync_entities`.
2. Implement the PostgreSQL adapter with transactional concurrency protection.
3. Replace the temporary runtime model with `SYNC_ENTITY_ID`.
4. Add automatic Docker image availability handling.
5. Connect the worker to the repository and ProvisioningService.
6. Add integration tests for status transitions and duplicate-worker protection.
7. Publish the Orchestration Engine image and validate the real runtime path.
8. Configure and execute an authenticated GitHub Actions end-to-end test.
