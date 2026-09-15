# ipaas-provisioning-engine

POC for the iPaaS Provisioning Engine to process integration configurations and provision Docker-based runtimes.

This branch contains the Node.js/TypeScript implementation of the Provisioning Engine
control-plane foundation.

## Prerequisites

- Node.js 24 LTS
- npm, included with Node.js
- Docker Desktop with Docker Compose for local PostgreSQL

## Install

```powershell
npm install
```

## Build

```powershell
npm run build
```

Compiled JavaScript and source maps are written to `dist/`.

## Run

```powershell
npm start
```

The process emits structured JSON logs and remains active until it receives `SIGINT` or
`SIGTERM`. Configuration is read directly from environment variables:

- `LOG_LEVEL`: `debug`, `info`, `warn`, or `error`; defaults to `info`.
- `STATUS_LOG_INTERVAL_MS`: positive heartbeat interval; defaults to `60000`.
- `DATABASE_URL`: PostgreSQL connection string required by `npm run db:initialize`.
- `RUNTIME_IMAGE_MAPPINGS_JSON`: JSON array of approved source/destination image mappings;
  each mapping selects `DockerHub` or `GHCR` plus a repository and tag. It defaults to the
  POC mappings shown in `.env.example`.
- `DOCKER_SOCKET_PATH`: Docker Engine socket; defaults to Docker Desktop's Windows named
  pipe on Windows and `/var/run/docker.sock` on Linux/macOS.
- `GITHUB_ACTIONS_API_BASE_URL`, `GITHUB_ACTIONS_OWNER`,
  `GITHUB_ACTIONS_REPOSITORY`, `GITHUB_ACTIONS_WORKFLOW`, and `GITHUB_ACTIONS_REF`:
  identify the workflow-dispatch target.
- `GITHUB_TOKEN`: required only when dispatching; keep it outside source control.

The `.env.example` file documents non-secret examples. The application deliberately does
not load `.env` files, so local values should be exported into the process environment.

## Run the Provisioning Engine in Docker

The multi-stage `Dockerfile` builds TypeScript with Node 24 and copies only compiled
JavaScript, production dependencies, package metadata, and database initialization SQL
into the final `node:24-bookworm-slim` image. The process runs as the non-root `node` user.

Set a local-only PostgreSQL password, then build and start PostgreSQL and the engine:

```powershell
$env:POSTGRES_PASSWORD = "<local-url-safe-password>"
docker compose build provisioning-engine
docker compose up -d
docker compose ps
docker compose logs provisioning-engine
```

Within the Compose network, the engine receives a `DATABASE_URL` whose hostname is
`postgres`, not `localhost`. Normal application startup does not query PostgreSQL yet.
Validate connectivity with the existing compiled migration command inside the engine
container:

```powershell
docker compose exec provisioning-engine node dist/database/migrate.js
```

Stop the services gracefully with:

```powershell
docker compose stop provisioning-engine
docker compose logs provisioning-engine
docker compose down
```

Compose passes the existing configuration names into the container. Optional values such
as `LOG_LEVEL`, `STATUS_LOG_INTERVAL_MS`, `RUNTIME_IMAGE_MAPPINGS_JSON`, GitHub Actions
settings, and `GITHUB_TOKEN` can be set in the host environment before startup. Secrets
are not copied into the image.

For this local POC, Compose mounts `/var/run/docker.sock` so the containerized engine can
reach Docker Desktop if the direct Docker provisioning path is invoked. Access to the
Docker socket effectively grants powerful control over the host Docker Engine. This mount
is not the intended production security model. The default non-root user is retained; if
the host socket does not permit that user to connect, do not weaken permissions or switch
to root without explicitly evaluating that tradeoff.

## Tests and type checking

```powershell
npm test
npm run typecheck
```

Tests use the Node.js built-in test runner, so no test framework dependency is required.

## Local Docker verification

With Docker Desktop running in Linux-container mode:

```powershell
npm run docker:verify
```

This creates and starts a uniquely named `hello-world:latest` container, then prints its
id, name, image, final state, and logs. The short-lived container exiting is expected.

## GitHub Actions deployment path

The shared `.github/workflows/provision-runtime.yml` workflow runs on a self-hosted Windows
runner and provisions the requested image through local Docker Desktop. A fine-grained
token needs repository **Actions: write** permission. A classic personal access token needs
the `repo` scope for a private repository.

Live dispatch is opt-in:

```powershell
$env:RUN_GITHUB_INTEGRATION_TESTS = "true"
$env:GITHUB_ACTIONS_API_BASE_URL = "https://api.github.com"
$env:GITHUB_ACTIONS_OWNER = "kunal-tezo"
$env:GITHUB_ACTIONS_REPOSITORY = "ipaas-provisioning-engine"
$env:GITHUB_ACTIONS_WORKFLOW = "provision-runtime.yml"
$env:GITHUB_ACTIONS_REF = "main-node" # Must contain the workflow file.
$env:GITHUB_TOKEN = "<token-with-actions-write-permission>"
$env:GITHUB_INTEGRATION_TEST_IMAGE = "hello-world:latest"
npm run github:verify
```

`GITHUB_ACTIONS_REF` is read at execution time, so the live target branch can always be
overridden without changing test or production code. Leave
`RUN_GITHUB_INTEGRATION_TESTS` unset or set to any value other than `true` to skip dispatch.

### Public registry-path verification

The opt-in registry verification resolves two approved, public test mappings through the
existing configuration-backed resolver and dispatches the existing workflow once per
registry:

- Docker Hub: `docker.io/library/hello-world:latest`
- GHCR: `ghcr.io/jonashackt/hello-world:latest`

Use the same GitHub settings as above, then run:

```powershell
$env:RUN_GITHUB_INTEGRATION_TESTS = "true"
$env:GITHUB_ACTIONS_API_BASE_URL = "https://api.github.com"
$env:GITHUB_ACTIONS_OWNER = "kunal-tezo"
$env:GITHUB_ACTIONS_REPOSITORY = "ipaas-provisioning-engine"
$env:GITHUB_ACTIONS_WORKFLOW = "provision-runtime.yml"
$env:GITHUB_ACTIONS_REF = "main-node" # Must contain the workflow file.
$env:GITHUB_TOKEN = "<token-with-actions-write-permission>"
npm run registry:verify
```

The script prints each resolver result and accepted workflow-dispatch response. GitHub's
workflow-dispatch endpoint normally returns HTTP 204 without a run id, so verify the two
runs and their container output in GitHub Actions. The configured Tezo images are not
used by this public-image check and are therefore not live-validated by it.

Public images can be pulled anonymously. Private Docker Hub or GHCR images require an
explicit `docker login` on the runner using credentials held in GitHub Secrets; private
registry authentication remains outside the current POC scope.

### ONE_TIME end-to-end demo

The demo entry point uses the existing application composition and calls
`ProvisioningService.triggerDeployment()` with explicit ONE_TIME metadata. It defaults to
the confirmed public GHCR image; set `ONE_TIME_DEMO_REGISTRY=DockerHub` for the equivalent
public Docker Hub run.

```powershell
$env:RUN_GITHUB_INTEGRATION_TESTS = "true"
$env:GITHUB_ACTIONS_API_BASE_URL = "https://api.github.com"
$env:GITHUB_ACTIONS_OWNER = "kunal-tezo"
$env:GITHUB_ACTIONS_REPOSITORY = "ipaas-provisioning-engine"
$env:GITHUB_ACTIONS_WORKFLOW = "provision-runtime.yml"
$env:GITHUB_ACTIONS_REF = "main-node"
$env:GITHUB_TOKEN = "<token-with-actions-write-permission>"

# Main GHCR demo
Remove-Item Env:ONE_TIME_DEMO_REGISTRY -ErrorAction SilentlyContinue
npm run demo:one-time

# Second, registry-neutral Docker Hub example
$env:ONE_TIME_DEMO_REGISTRY = "DockerHub"
npm run demo:one-time
```

Each run prints the integration metadata, resolved image, and reliable dispatch response.
GitHub normally returns HTTP 204 without a workflow run id; inspect the resulting run in
GitHub Actions for the runner-side Docker status and logs.

## Local PostgreSQL

Set matching local-only credentials in the process environment:

```powershell
$env:POSTGRES_PASSWORD = "<local-password>"
$env:DATABASE_URL = "postgresql://provisioning_engine:<local-password>@localhost:5432/ipaas_provisioning"
```

Start PostgreSQL and wait for it to become healthy:

```powershell
docker compose up -d postgres
docker compose ps
```

Apply the ordered schema and sample-data SQL files through the Node migration command:

```powershell
npm run db:initialize
```

Query the seeded integration:

```powershell
docker compose exec postgres psql -U provisioning_engine -d ipaas_provisioning -c "SELECT c.integration_id, c.tenant_id, c.source_connector, c.destination_connector, string_agg(e.entity_name, ', ' ORDER BY e.entity_name) AS entities, c.sync_mode, c.sync_direction, c.schedule, c.provisioning_status FROM integration_configurations c JOIN integration_entities e USING (integration_id) GROUP BY c.integration_id ORDER BY c.created_at;"
```

The SQL files are idempotent. To deliberately recreate the local database from an empty
volume:

```powershell
docker compose down --volumes
docker compose up -d postgres
npm run db:initialize
```

## Current scope

The current implementation provides a TypeScript build, environment configuration,
structured logging, graceful process shutdown, a minimal long-running worker, and direct
PostgreSQL schema/sample-data initialization using `pg`. Application ports separate the
runtime image resolver, local Docker provisioner, and GitHub Actions deployment trigger
from their infrastructure implementations. `ProvisioningService` is a small façade that
resolves an approved image before delegating to either existing provisioning path. The
approved catalogue produces fully qualified references, for example:

```text
workday -> keka -> ghcr.io/tezo/workday-keka-runtime:1.0.0
bamboohr -> keka -> docker.io/tezo/bamboohr-keka-runtime:1.0.0
```

Database polling, request claiming, integration validation, registry authentication/API
access, workflow status polling, scheduling,
checkpoints, retries/recovery, connector behavior, CDM transformation, and synchronization
execution are intentionally outside this issue.

`ProvisioningWorker` remains lifecycle-only: it logs startup and health information but
does not poll PostgreSQL or invoke `ProvisioningService` automatically.

## Architecture

Dependencies point inward toward application contracts:

```text
index.ts -> bootstrap.ts -> infrastructure adapters
                              |
                              v
                     application ports/models
                              ^
                              |
                    ProvisioningService façade
```

`bootstrap.ts` is the only production composition root. It builds the Docker client and
injects concrete runtime-image, Docker, and GitHub implementations behind application
ports. Technology-independent application code does not import `pg`, `dockerode`,
GitHub configuration, or environment variables.

## Project structure

```text
src/
|-- application/    Use-case façade, models, errors, and technology-neutral ports
|-- config/         Central environment configuration and provider-specific parsing
|-- database/       Database-initialization command entry point
|-- infrastructure/ PostgreSQL, Docker, GitHub, and configured-catalogue adapters
|-- logging/        Structured JSON logging
|-- scripts/        Deterministic local verification entry points
|-- workers/        Long-running background work
|-- bootstrap.ts    Creates and injects concrete application dependencies
`-- index.ts        Process lifecycle and signal handling
```

The SQL schema and sample data live under `database/init`; local PostgreSQL configuration
lives in `docker-compose.yml`.
