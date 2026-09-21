# Local Windows self-hosted runner setup

This runbook describes the temporary local-demo configuration on `dev`. It uses runner-local Windows environment variables: no GitHub Environment, repository Secrets, or repository Variables are required for this mode. Restore GitHub-managed configuration and managed secrets before production use.

## Quick start checklist

Use this checklist as your route through the guide; the numbered procedures below provide commands and link to configuration details.

1. Start Docker Desktop in **Linux container mode**.
2. [Clone the repository and switch to dev](#3-clone-the-repository).
3. [Start ipaas.infra and apply its migrations](#stage-11-start-shared-infrastructure).
4. Verify `ipaas-postgres` is healthy and `ipaas-network` exists.
5. Configure the four [User-scope variables](#8-runner-local-user-variables), including the existing encryption key when applicable.
6. [Install/register a Windows self-hosted runner](#12-install-and-start-the-runner).
7. Restart the runner after configuring environment variables; preferably reopen PowerShell first.
8. Leave the runner on `Listening for Jobs` for **both** deployment and runtime jobs.
9. Use a successful PE CD deployment on this machine, or trigger eligible dev CI/CD.
10. Verify `ipaas-provisioning-engine` is running with the expected revision/image.
11. Follow its logs and confirm idle polling with `claimedCount=0`.
12. Create a **fresh** demo sync entity.
13. Watch `submitted -> provisioning`.
14. Watch the `provision-runtime` workflow arrive on the runner.
15. Verify `ipaas-sync-<syncEntityId>` and its exit state.
16. Verify final DB status: completed / failed / provisioning when uncertain.

## Terminology

| Term | Meaning |
| --- | --- |
| Long-running PE | Stage 1 PE Docker container that polls the DB and dispatches GitHub workflows. |
| Explicit PE | Stage 2 PE process started on the runner host by provision-runtime.yml for one SYNC_ENTITY_ID. |
| Runtime container | Per-entity OE container named ipaas-sync-<syncEntityId>. |
| Deterministic container | The same entity ID always maps to the same runtime container name on the selected daemon. |
| Reconciliation | Inspecting an existing runtime to determine its outcome without deleting/recreating it. |

**Environment restart rule:** if you set `PLATFORM_DATABASE_URL`, `PLATFORM_RUNTIME_DATABASE_URL`, `PLATFORM_ENCRYPTION_MASTER_KEY` or `PROVISIONING_GITHUB_DISPATCH_TOKEN` after `run.cmd` starts, Ctrl+C the runner, preferably reopen PowerShell, then start `run.cmd` again. The already-running process may have stale inherited variables. See [scope and inheritance details](#13-environment-inheritance-and-restart).

## 1. Architecture: two separate Provisioning Engine executions

```text
STAGE 1 — Long-running Provisioning Engine
GitHub CI/CD
  -> Windows self-hosted runner
  -> Docker Desktop
  -> ipaas-provisioning-engine container
  -> RUNTIME_PROVIDER=github
  -> poll shared PostgreSQL
  -> claim submitted rows
  -> dispatch provision-runtime.yml

STAGE 2 — Explicit Provisioning Engine
provision-runtime.yml
  -> same intended Windows self-hosted runner
  -> explicit PE process on the runner HOST
  -> RUNTIME_PROVIDER=docker + SYNC_ENTITY_ID + EXPECTED_RUNTIME_IMAGE
  -> Docker Desktop: create/reconcile ipaas-sync-<id>
  -> wait/inspect runtime
  -> conditionally update sync_entities status
```

Stage 1 is a **long-running Docker container**. Stage 2 PE itself is a **host-side process**; it talks to Docker Desktop to manage the per-entity runtime container. These are separate PE executions. GitHub accepting dispatch is not execution completion.

`[self-hosted, Windows]` is only a selector. Configure runner placement so both stages reach the intended Docker daemon and shared network. Multiple eligible developer machines are not interchangeable. Placement is a deployment prerequisite, not an idempotency mechanism.

## Before you start: readiness checks

On a fresh machine, complete the setup in Stage 1.1–1.4 below first, then run these checks **before deployment or any entity test**. Run them under the runner account:

```powershell
docker info --format "{{.OSType}}"
docker ps --filter "name=ipaas-postgres"
docker network inspect ipaas-network
[bool][Environment]::GetEnvironmentVariable("PLATFORM_DATABASE_URL","User")
[bool][Environment]::GetEnvironmentVariable("PLATFORM_RUNTIME_DATABASE_URL","User")
[bool][Environment]::GetEnvironmentVariable("PLATFORM_ENCRYPTION_MASTER_KEY","User")
[bool][Environment]::GetEnvironmentVariable("PROVISIONING_GITHUB_DISPATCH_TOKEN","User")
```

Expect `linux`, healthy PostgreSQL, an existing network, and four `True` values. The runner terminal must show `Listening for Jobs`. Only proceed when all checks pass; these commands do not print secret values.

## Stage 1 — Start the long-running PE

First read [prerequisites](#2-prerequisites) and [clone the repo](#3-clone-the-repository). Use a second PowerShell terminal for commands while the runner stays open.

### Stage 1.1 Start shared infrastructure

```powershell
cd C:\Tezo\ipaas.platform\ipaas.infra
Copy-Item .env.example .env
```

For a fresh setup only, edit `.env` with the [required local values](#5-start-shared-infrastructure). Do not overwrite an existing configured `.env`. Then run the supported infra commands:

```powershell
docker compose up -d
docker compose ps
# Wait for PostgreSQL to be healthy before migration.
npm install
npm run migrate:up
```

### Stage 1.2 Verify PostgreSQL/network

```powershell
docker ps --filter "name=ipaas-postgres"
docker network inspect ipaas-network
docker exec -it ipaas-postgres psql -U ipaas -d ipaas_platform
```

Run `\dt` and check the [expected tables](#6-verify-the-database), then `\q`.

### Stage 1.3 Configure local User variables

Follow [sections 8–11](#8-runner-local-user-variables) for the four settings, encryption key and dispatch token. Use the **host** URL for PLATFORM_DATABASE_URL and the **container** URL for PLATFORM_RUNTIME_DATABASE_URL. Substitute your local values privately; do not print them. Reuse the existing encryption key if credentials already exist.

### Stage 1.4 Start/restart self-hosted runner

Follow [GitHub's runner registration instructions](#12-install-and-start-the-runner), then:

```powershell
cd C:\actions-runner
.\run.cmd
```

Expect `Connected to GitHub` and `Listening for Jobs`. If variables changed after startup, Ctrl+C, reopen PowerShell, and run again. Keep this terminal open for both stages. Now run the [readiness checks](#before-you-start-readiness-checks).

### Stage 1.5 Trigger/use latest PE CD

PR builds do **not** deploy. An eligible push/merge to dev triggers PE CI and CD after successful tests and image publication. In the Actions UI, select **Build & Publish Provisioning Engine Image**, choose **Run workflow** on dev, and enable the deploy input when using the existing manual CI path. Alternatively, use an already successful deployment of the desired revision **on this same machine**. A green deployment on another developer's runner does not deploy locally.

Keep the runner listening and wait for CD to finish. See [CI/CD details](#16-cicd-and-deployment-verification). Ensure runner selection resolves to the intended host before triggering jobs.

### Stage 1.6 Verify long-running PE container

```powershell
docker ps --filter "name=ipaas-provisioning-engine"
docker inspect ipaas-provisioning-engine --format "{{.State.Status}}|{{.Config.Image}}|{{.RestartCount}}"
```

Expect `running|<expected-digest-pinned-image>|0`. Compare the deployed revision/image with successful CD output.

### Stage 1.7 Verify polling logs

```powershell
docker logs -f ipaas-provisioning-engine
```

Expect `Shared IPAAS Platform database schema verified`, `Provisioning Engine started`, `Polling worker started`, `Provisioning poll started`, and `Provisioning poll completed` with `claimedCount=0` when idle.

**If you can see these startup and repeated polling logs, Stage 1 is working.** Ctrl+C on `docker logs -f` only stops following logs; leave the runner itself running.

## Stage 2 — Provision and verify a runtime

### Stage 2.1 Confirm runner is still listening

Expect `Listening for Jobs`. The runner must access the same Docker Desktop daemon/network used above.

### Stage 2.2 Confirm workflow registration

`.github/workflows/provision-runtime.yml` must exist on the default branch **main** for registration and on **dev** for execution. Dispatch uses `ref=dev`. Do not change the default branch. See [registration details](#18-workflow-registration-on-main-dispatch-on-dev).

### Stage 2.3 Create a fresh demo entity

Run the [three demo inserts](#21-create-new-demo-data-manually), using returned tenant/request IDs and `one_time`. The new entity starts submitted. Use a new entity for a clean test: the runtime name `ipaas-sync-<syncEntityId>` is deterministic. For a different OE image, complete the [new-image procedure](#testing-a-new-orchestration-engine-image) first.

### Stage 2.4 Watch Stage 1 logs

```powershell
docker logs -f ipaas-provisioning-engine
```

With only your new row pending, expect `Provisioning poll started`, `Provisioning batch claimed` with `claimedCount=1`, `Sync entity processing started`, `Runtime provisioning workflow dispatched`, `Sync entity processing completed`, and `Provisioning batch drained`. More pending rows can produce a larger count. Use the [claim query](#22-verify-the-claim) to observe submitted -> provisioning; a fast runtime may already be terminal by the time you query.

### Stage 2.5 Watch runner receive Stage 2 job

In Actions, look for the run `Provision sync entity <uuid>` under **Provision entity runtime**. The runner executes its explicit PE step. Inspect correlated runtime logs there; Stage 2 output is separate from Stage 1 container logs.

### Stage 2.6 Verify runtime container

Replace `<id>` with your entity UUID:

```powershell
docker ps -a --filter "name=ipaas-sync-"
docker inspect ipaas-sync-<id> --format "{{.State.Status}}|{{.Config.Image}}|{{.State.ExitCode}}"
docker logs ipaas-sync-<id> --tail 100
```

### Stage 2.7 Verify DB status

```sql
SELECT id, status, updated_at FROM sync_entities
WHERE id = '<sync-entity-id>';
```

For one_time, definitive exit 0 -> completed; non-zero -> failed; uncertain runtime outcome -> provisioning pending reconciliation. Updates are conditional: an existing concurrent terminal state is preserved. Even if another actor recorded completed, a definitive failed runtime now makes the explicit PE fail Stage 2. Investigate that discrepancy; it is not a successful runtime.

**If the workflow ran, the runtime container exists, and DB status matches the definitive runtime result, Stage 2 is working.** The known missing-adapter image may exit 1: recording failed proves lifecycle handling, not successful business synchronization. See [reconciliation and existing OE ownership limits](#25-verify-terminal-lifecycle-and-reconciliation).

## Detailed setup reference

The sections below provide the values, commands and operational details linked from the procedures above.

## 2. Prerequisites

Install Windows, Docker Desktop using Linux containers, Git, PowerShell, and Node.js 24/npm as used by repository workflows. Obtain repository access, permission to register a self-hosted runner, and access to the GHCR images. Windows PowerShell 5.1 and PowerShell Core are supported by the deployment safety tests.

Previously observed versions include Docker 26.1.4, Compose v2.27.1-desktop.1, Git 2.45.0, and runner 2.337.0; these are examples, not exact version requirements. Docker Desktop must be running under an account the runner can use. For private runtime images, authenticate that account to GHCR securely; the Docker adapter uses its existing daemon/image access. Do not put authentication values in commands saved to the repository.

## 3. Clone the repository

```powershell
cd C:\Tezo
git clone https://github.com/rajkamal29/ipaas.platform.git
cd C:\Tezo\ipaas.platform
git switch dev
```

`ipaas.infra` owns PostgreSQL, its network, and migrations. `ipaas.provisioningengine` owns provisioning. `ipaas.orchestrationengine` performs synchronization. `ipaas.providers` contains provider adapters. Do not create another database or network for PE.

## 4. Shared infrastructure

Expected local defaults: container `ipaas-postgres`, database `ipaas_platform`, user `ipaas`, published port 5432, network `ipaas-network`.

```powershell
docker ps --filter "name=ipaas-postgres"
docker network inspect ipaas-network
```

PE and runtime containers reuse this infrastructure. A missing network prevents deployment/runtime creation; an unhealthy or unreachable database prevents schema preflight and startup.

## 5. Start shared infrastructure

Use the commands supported by `ipaas.infra/README.md`:

```powershell
cd C:\Tezo\ipaas.platform\ipaas.infra
Copy-Item .env.example .env
```

Edit the untracked `ipaas.infra/.env` locally before starting. Required values are:

```dotenv
POSTGRES_USER=ipaas
POSTGRES_PASSWORD=<local-password>
POSTGRES_DB=ipaas_platform
DATABASE_URL=postgresql://ipaas:<URL-encoded-password>@localhost:5432/ipaas_platform
```

Never commit this file. Use a real local password; URL-encode special characters in connection URLs. Then:

```powershell
docker compose up -d
docker compose ps
npm install
npm run migrate:up
```

Wait for PostgreSQL to be healthy before migrations. These commands create the infra-owned network and apply its existing migrations. Changing `.env` does not reset credentials in an existing PostgreSQL volume. Follow infra's operations documentation for existing installations; do not delete volumes to troubleshoot PE.

## 6. Verify the database

```powershell
docker exec -it ipaas-postgres psql -U ipaas -d ipaas_platform
```

Inside psql, run `\dt`. Key public tables are `tenants`, `sync_requests`, `sync_entities`, `credentials`, `sync_state`, `canonical_entities`, `mapping_profiles`, and `global_mapping_profiles`. Use `\q` to leave. PE validates the shared schema at startup; it does not migrate it.

## 7. Host versus container database URLs

Host-side explicit PE uses `postgresql://<user>:<password>@localhost:5432/ipaas_platform`. Containers on `ipaas-network` use `postgresql://<user>:<password>@ipaas-postgres:5432/ipaas_platform`. These address the same database. Docker's `ipaas-postgres` DNS name does not normally resolve from a Windows host process; `localhost` inside a container refers to that container, not PostgreSQL.

## 8. Runner-local User variables

Configure these for the Windows account running the runner:

| Variable | Purpose |
| --- | --- |
| `PLATFORM_DATABASE_URL` | Host-side explicit PE database connection |
| `PLATFORM_RUNTIME_DATABASE_URL` | Container database connection for long-running PE and runtime |
| `PLATFORM_ENCRYPTION_MASTER_KEY` | Shared credential encryption key |
| `PROVISIONING_GITHUB_DISPATCH_TOKEN` | Stage 1 GitHub workflow dispatch authentication |

```powershell
[Environment]::SetEnvironmentVariable(
    "PLATFORM_DATABASE_URL",
    "postgresql://<user>:<password>@localhost:5432/ipaas_platform", "User")
[Environment]::SetEnvironmentVariable(
    "PLATFORM_RUNTIME_DATABASE_URL",
    "postgresql://<user>:<password>@ipaas-postgres:5432/ipaas_platform", "User")
```

Replace placeholders locally without recording credentials in shared transcripts. Deployment mode maps `DATABASE_URL` and `RUNTIME_DATABASE_URL` to `PLATFORM_RUNTIME_DATABASE_URL`. Runtime mode maps `DATABASE_URL` to `PLATFORM_DATABASE_URL` and `RUNTIME_DATABASE_URL` to `PLATFORM_RUNTIME_DATABASE_URL`. Both modes map `ENCRYPTION_MASTER_KEY` from `PLATFORM_ENCRYPTION_MASTER_KEY`.

## 9. Encryption key

For a fresh installation only, generate 32 cryptographically random bytes:

```powershell
$keyBytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($keyBytes)
$rng.Dispose()
$encryptionKey = [Convert]::ToBase64String($keyBytes)
[Environment]::SetEnvironmentVariable(
    "PLATFORM_ENCRYPTION_MASTER_KEY", $encryptionKey, "User")
```

Do not print or commit the key, and never use an all-zero key. If encrypted credentials already exist, reuse their existing key; generating a replacement would make them unreadable. Rotation needs a separate migration plan.

## 10. GitHub dispatch token

For this temporary demo, use a fine-grained PAT restricted to `rajkamal29/ipaas.platform` with repository **Actions: read and write**, required by the workflow dispatch endpoint. Obtain organization approval if applicable. Give it an expiry and rotate it. See [GitHub dispatch API permissions](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).

```powershell
[Environment]::SetEnvironmentVariable(
    "PROVISIONING_GITHUB_DISPATCH_TOKEN", "<token>", "User")
```

This is for workflow dispatch, not database access. A deployment job's short-lived `GITHUB_TOKEN` is not a persistent credential for a long-running service. Never bake the PAT into an image or log it.

## 11. Verify presence without revealing values

```powershell
[bool][Environment]::GetEnvironmentVariable("PLATFORM_DATABASE_URL","User")
[bool][Environment]::GetEnvironmentVariable("PLATFORM_RUNTIME_DATABASE_URL","User")
[bool][Environment]::GetEnvironmentVariable("PLATFORM_ENCRYPTION_MASTER_KEY","User")
[bool][Environment]::GetEnvironmentVariable("PROVISIONING_GITHUB_DISPATCH_TOKEN","User")
```

Expect four `True` values. Do not echo secret variables or dump the environment.

## 12. Install and start the runner

Open repository Settings -> Actions -> Runners -> New self-hosted runner -> Windows. Follow GitHub's generated download/configuration commands in `C:\actions-runner`; use the official [adding self-hosted runners guide](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners) as the installation authority. Registration tokens are temporary; do not commit them. Then:

```powershell
cd C:\actions-runner
.\run.cmd
```

Expect `Connected to GitHub` and `Listening for Jobs`. **Leave the runner running for BOTH Stage 1 deployment jobs and Stage 2 runtime jobs.** Interactive mode under the Docker Desktop user is preferred for this demo. A service account may have different User variables and no access to that user's Docker daemon. Do not run untrusted pull-request code on a privileged local runner.

## 13. Environment inheritance and restart

Running processes do not automatically inherit later User environment changes. After configuring variables, stop the runner with Ctrl+C, reopen PowerShell if needed, and run `.\run.cmd` again from `C:\actions-runner`.

A symptom is `Missing runner-local setting: PLATFORM_RUNTIME_DATABASE_URL`. Check presence under the actual runner account, then restart. The current helper reads User scope directly first, with Process and Machine fallbacks; that can see updated User values without inheritance, but it cannot read a different user's settings. Restart also refreshes tools relying on inherited process values.

## 14. Verify Docker under the runner account

```powershell
docker info --format "{{.OSType}}"
docker context inspect --format "{{.Endpoints.docker.Host}}"
```

Expect `linux` and a reachable Docker Desktop endpoint. Docker Desktop must be running, Linux container mode selected, and the runner account authorized for Docker. The runtime workflow uses `//./pipe/docker_engine`; ensure this reaches the intended daemon. Wrong daemon/account means missing networks, inaccessible images, or runtimes on the wrong host.

## 15. Local demo helper

```powershell
cd C:\Tezo\ipaas.platform\ipaas.provisioningengine
. .\deploy\local-demo.ps1
Initialize-LocalDemoEnvironment -Mode deployment
```

This resolves the container-facing database, key, dispatch token, catalogue, log level and polling settings into the current process for deployment. For host-side explicit execution:

```powershell
Initialize-LocalDemoEnvironment -Mode runtime
```

Runtime mode uses the host database URL and does not require the dispatch token. The workflow supplies the runtime provider and explicit identity. The helper alone does not deploy, dispatch, or run an entity. Never print the complete resulting environment.

## 16. CI/CD and deployment verification

A qualifying push/merge to `dev` triggers PE CI: `npm ci`, typecheck, tests, build, deployment safety and local-demo tests, then GHCR publication with `dev-<shortsha>` and `dev-latest`. After successful publication the reusable deployment workflow receives the full revision and published digest, pulls the exact digest-pinned image, runs configuration/shared-schema preflight, replaces only the provisioning service, and verifies it. PR verification does not deploy.

The job token uses package-read permission for the PE pull; the package must permit this repository's Actions access. Package access is separate from the runtime dispatch PAT. CD does not build locally or recreate `ipaas-network`.

```powershell
docker ps --filter "name=ipaas-provisioning-engine"
docker inspect ipaas-provisioning-engine --format "{{.State.Status}}|{{.Config.Image}}|{{.RestartCount}}"
docker logs ipaas-provisioning-engine --tail 100
```

Expect `running|<digest-pinned-image>|0` and `Shared IPAAS Platform database schema verified`, `Provisioning Engine started`, `Polling worker started`. Check CI/CD revision and digest against the deployment output. Do not dump full Docker inspect/config output, which includes environment secrets.

## 17. Watch polling and shutdown

```powershell
docker logs -f ipaas-provisioning-engine
```

Idle cycles emit `Provisioning poll started` and `Provisioning poll completed` with `claimedCount=0`. Work cycles additionally emit `Provisioning batch claimed`, `Sync entity processing started` with `syncEntityId`, `Runtime provisioning workflow dispatched`, `Sync entity processing completed`, and `Provisioning batch drained`. Startup includes provider, poll interval, batch size and concurrency; defaults remain 60000 ms, 10 and 5.

The interval follows batch drain, so a busy batch can extend time between polls. If unexplained silence exceeds the expected interval, check running state, restart count, database connectivity, a stuck request, process failure, and deployed revision. Graceful shutdown emits `Provisioning worker stopping` then `Provisioning worker stopped` after in-flight work drains. Runtime lifecycle logs appear in the explicit workflow, not necessarily the long-running container.

## 18. Workflow registration on main, dispatch on dev

The repository default branch remains `main`. `.github/workflows/provision-runtime.yml` must exist on `main` for GitHub's `workflow_dispatch` registration requirement; dispatch still sends `ref: dev` and executes the workflow at that ref. Do not change the default branch. See [GitHub workflow_dispatch requirements](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatch).

The previous symptom was HTTP 404 from `POST /repos/rajkamal29/ipaas.platform/actions/workflows/provision-runtime.yml/dispatches`. Ensure registration on main and the file on dev, then check token repository access and Actions permissions if 404 persists. GitHub may conceal inaccessible repositories with 404.

## 19. Runtime workflow contract

Inputs are `sync_entity_id` and `image_reference`. The workflow sets:

```dotenv
RUNTIME_PROVIDER=docker
SYNC_ENTITY_ID=<input>
EXPECTED_RUNTIME_IMAGE=<input>
DOCKER_NETWORK=ipaas-network
DOCKER_SOCKET_PATH=//./pipe/docker_engine
```

The image must match the approved provider-pair catalogue. No tenant credentials or auth tokens are workflow inputs. Workflow concurrency is grouped by entity ID.

## 20. Inspect the approved runtime catalogue safely

Current demo mapping: `connectwise` -> `keka`, image `ghcr.io/rajkamal29/ipaas-orchestration-engine:dev-latest`.

After initializing the helper, this specific non-secret value can be inspected:

```powershell
$env:RUNTIME_IMAGE_MAPPINGS_JSON | ConvertFrom-Json
```

The runtime tag is mutable and the adapter may reuse a locally available image. This is distinct from the digest-pinned PE deployment. Never remove an existing deterministic container to force a newer image into the same entity execution.

## 21. Create NEW demo data manually

Do not mutate/requeue old test rows. Existing entities may already have deterministic containers. Enter psql as in section 6 and use fresh returned IDs:

```sql
INSERT INTO tenants (name)
VALUES ('Stage2 Demo Tenant') RETURNING id;

INSERT INTO sync_requests (tenant_id, source, target)
VALUES ('<tenant-id>', 'connectwise', 'keka') RETURNING id;

INSERT INTO sync_entities (sync_request_id, entity, sync_type)
VALUES ('<sync-request-id>', 'client', 'one_time') RETURNING id, status;
```

Expect `submitted`. These rows prove provisioning; successful business synchronization also requires valid credentials, schemas, mappings, provider access, and a working runtime image. Do not put credential values in shared SQL examples.

## 22. Verify the claim

```sql
SELECT se.id, se.entity, se.sync_type, se.status, sr.source, sr.target
FROM sync_entities se
JOIN sync_requests sr ON sr.id = se.sync_request_id
WHERE se.id = '<sync-entity-id>';
```

Watch `submitted` -> `provisioning` and correlated poll, claim and dispatch logs. Only submitted rows are claimed. Failed/provisioning rows are not automatically retried.

## 23. Verify the explicit workflow

The runner should receive `Provision sync entity <uuid>`. The dispatch contract is:

```text
POST /repos/rajkamal29/ipaas.platform/actions/workflows/provision-runtime.yml/dispatches
```

```json
{
  "ref": "dev",
  "inputs": {
    "sync_entity_id": "<uuid>",
    "image_reference": "ghcr.io/rajkamal29/ipaas-orchestration-engine:dev-latest"
  }
}
```

Check the workflow's explicit PE logs for runtime state and conditional status persistence. A successful dispatch only acknowledges scheduling.

## 24. Verify the per-entity runtime

```powershell
docker ps -a --filter "name=ipaas-sync-"
docker inspect ipaas-sync-<syncEntityId> --format "{{.State.Status}}|{{.Config.Image}}|{{.State.ExitCode}}"
docker logs ipaas-sync-<syncEntityId> --tail 100
```

Replace the placeholder before executing. The name is deterministic. Logs from provider/runtime code may contain business data; inspect locally and redact before sharing. PE never prints raw inspect payloads or provider credentials.

## 25. Verify terminal lifecycle and reconciliation

```sql
SELECT id, status, updated_at FROM sync_entities
WHERE id = '<sync-entity-id>';
```

For one_time, definitive exited/0 becomes completed; definitive exited/nonzero becomes failed. Newly created containers are observed using Docker wait followed by inspect, bounded by the existing Docker request timeout (default 120000 ms). Timeout does not stop the runtime: status remains provisioning and reconciliation is required. GitHub acceptance or successful start alone never means completed.

Existing running containers stay provisioning without being started again. Existing exited containers reconcile their exit code. Created, paused, restarting, removing, dead, unknown or mismatched containers require investigation; they are not deleted/recreated/restarted. Only the invocation that successfully creates the deterministic container may start it.

After an uncertain timeout, inspect the existing container. If it is now definitively exited and the row is still provisioning, an operator may manually dispatch the same workflow with the SAME entity ID and approved image to reconcile that existing execution. Do not reset failed rows or remove containers. There is no background reconciliation scheduler. Conditional updates never overwrite another terminal status.

**Existing ownership limitation:** the current OE still writes one-time statuses in `lib/orchestration/schedule.js` through `sync-entities.js`. This branch deliberately does not modify OE. PE preserves those concurrent terminal writes, so exclusive PE ownership requires a separate OE change. Exit-code-based PE completion is not a guarantee of business-level success while OE can return a successful process exit for an unsuccessful cycle. Interval and real_time behavior remain unchanged: supplied adapters reject interval; real_time is unsupported.

## Testing a new Orchestration Engine image

Use this procedure when a new OE image is ready and you want PE to launch it. No PE application/source logic changes are needed for an image-only update. Catalogue configuration and its exact-mapping test fixture do need to be kept in sync; normal validation must remain enabled.

### Prerequisites and image availability

Know the exact reference, for example `ghcr.io/rajkamal29/ipaas-orchestration-engine:<new-tag>`, and preferably record its immutable `ghcr.io/rajkamal29/ipaas-orchestration-engine@sha256:<digest>` identity too. Use a unique release/commit tag that you will not republish.

**Current catalogue limitation:** the resolver accepts registry + repository + **tag** and constructs a tagged reference. Digest-only catalogue entries are not supported. A digest can verify an image pull, but do not pass a digest to EXPECTED_RUNTIME_IMAGE or workflow inputs when the catalogue resolves a tag: exact-match validation will reject it. Adding digest-aware catalogue support is outside this change.

The image must be pullable by the runner's Docker Desktop account and must accept `SYNC_ENTITY_ID`, `DATABASE_URL`, and `ENCRYPTION_MASTER_KEY`, reach the shared DB through `ipaas-network`, and exit with a meaningful process code for one_time work. PE validates launch identity/configuration and observes the process outcome; it does not validate OE business logic.

Before any of the following methods, verify availability on the intended Docker daemon:

```powershell
docker pull ghcr.io/rajkamal29/ipaas-orchestration-engine:<new-tag>
docker image inspect ghcr.io/rajkamal29/ipaas-orchestration-engine:<new-tag> --format "{{.Id}}|{{json .RepoDigests}}"
```

You can independently verify a published digest:

```powershell
docker pull ghcr.io/rajkamal29/ipaas-orchestration-engine@sha256:<digest>
docker image inspect ghcr.io/rajkamal29/ipaas-orchestration-engine@sha256:<digest> --format "{{.Id}}|{{json .RepoDigests}}"
```

Replace placeholders; never paste package tokens into documentation or screenshots. If a private pull is denied, authenticate securely using permitted package credentials following [GitHub Container Registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry). The dispatch PAT is a separate credential. Pre-pulling the approved tagged image under the runner account also avoids relying on the adapter's unauthenticated pull path for private images.

### Option A — Normal flow through the approved runtime catalogue

1. Publish the new OE image and verify the tagged pull above.
2. In `ipaas.provisioningengine/deploy/local-demo.ps1`, update only the approved provider pair's catalogue entry: `source=connectwise`, `target=keka`, `registry=GHCR`, `repository=rajkamal29/ipaas-orchestration-engine`, `tag=<new-tag>`. Preserve other approved entries if present. This is the current demo configuration source for both stages; repository Secrets/Variables do not override this hardcoded helper catalogue.
3. Update the expected catalogue/image assertions in `deploy/test-local-demo.ps1` to the approved new reference. Keep JSON parsing, exact mapping, compiled parser and secret-safety checks intact.
4. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and both `deploy/test-local-demo.ps1` and `deploy/test-deploy.ps1` from the PE directory. Build before the PowerShell tests because they use dist.
5. Review and merge the configuration change to dev; let PE CI/CD deploy the updated configuration on the intended runner. No OE/provider or PE application logic change is needed for this image swap.
6. Ensure **both** the long-running PE environment and the explicit workflow's dev checkout use that same approved mapping. Let in-flight dispatches finish before a catalogue rollout: an old Stage 1 image reference and newer Stage 2 catalogue will mismatch safely. Do not bypass that validation.
7. Create a fresh demo entity using [Stage 2.3](#stage-23-create-a-fresh-demo-entity). Watch claim and dispatch. Stage 2 receives `EXPECTED_RUNTIME_IMAGE=ghcr.io/rajkamal29/ipaas-orchestration-engine:<new-tag>`.
8. Verify the runtime image and final state using the common checks below.

Changing the mapping does not replace the environment of an already running PE container: redeployment is required. Changing only a dispatch input is also insufficient. `dev-latest` can reuse a cached image, so prefer a new unique tag. The catalogue resolves an image for a provider pair, not an individual entity override.

### Prepare a claimed row for Options B and C

Both direct methods still require a matching approved catalogue and an entity currently in **provisioning**. They skip Stage 1 polling/dispatch, not catalogue or lifecycle validation. Do not reset completed/failed rows. A normal claim also triggers automatic dispatch, so do not race a second manual run against it; if using an existing claimed row, first confirm no job is queued/running and no prior ambiguous dispatch is outstanding.

For a deliberate, isolated **local demo only**, an operator may create a NEW claimed fixture instead. Create a fresh tenant and request using section 21, then use this insert **instead of** its submitted-entity insert:

```sql
-- DEMO ONLY: a fresh, explicitly admitted row for a controlled direct Stage 2 test.
INSERT INTO sync_entities (sync_request_id, entity, sync_type, status)
VALUES ('<fresh-sync-request-id>', 'client', 'one_time', 'provisioning')
RETURNING id, status;
```

The poller claims submitted rows only, so it will not dispatch this fixture. This is not a production claiming/retry procedure. Use the returned new ID once with either B or C. Do not modify old rows or delete an existing deterministic runtime. These are manual instructions; this documentation change does not execute SQL.

### Option B — Directly test the Stage 2 workflow

First ensure the new approved mapping is on dev (steps 1–4 and the reviewed merge in Option A); a UI input cannot override it. This method can test Stage 2 without waiting for Stage 1 polling or its redeployment, but Stage 1 must be updated before resuming normal end-to-end use.

With a fresh provisioning row prepared above and the runner listening, open **Actions -> Provision entity runtime -> Run workflow**:

- Branch/ref: `dev`
- `sync_entity_id`: `<new provisioning row UUID>`
- `image_reference`: `ghcr.io/rajkamal29/ipaas-orchestration-engine:<new-tag>`

The workflow must still be registered on main. Observe the run and common verification below. The supplied reference must exactly match the catalogue on dev for this entity's source/target pair.

### Option C — Host-side explicit PE test

This is useful for debugging Stage 2 without GitHub dispatch; the normal end-to-end path remains provision-runtime.yml. Use a reviewed local checkout whose helper already contains the approved new mapping (as in Option A), the same runner account/daemon, and a NEW provisioning fixture. Do not start this alongside a workflow for the same entity.

```powershell
cd C:\Tezo\ipaas.platform\ipaas.provisioningengine
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
. .\deploy\local-demo.ps1
Initialize-LocalDemoEnvironment -Mode runtime
$env:RUNTIME_PROVIDER = 'docker'
$env:SYNC_ENTITY_ID = '<new provisioning row UUID>'
$env:EXPECTED_RUNTIME_IMAGE = 'ghcr.io/rajkamal29/ipaas-orchestration-engine:<new-tag>'
npm start
if ($LASTEXITCODE -ne 0) { throw 'Explicit PE failed; inspect correlated lifecycle logs.' }
```

`npm start` runs the compiled `dist/index.js`, exactly as package.json defines. Only non-secret execution inputs are set above; the helper loads secrets locally. Docker configuration retains the Windows named-pipe and ipaas-network defaults. Use a dedicated shell and close it afterward to discard these process-scoped inputs. Manually setting EXPECTED_RUNTIME_IMAGE does not bypass the local catalogue assertion.

### Verify the new image and outcome (all methods)

```powershell
docker ps -a --filter "name=ipaas-sync-"
docker inspect ipaas-sync-<id> --format "{{.Config.Image}}|{{.State.Status}}|{{.State.ExitCode}}"
docker logs ipaas-sync-<id> --tail 100
```

Config.Image must show the expected new **tagged** reference. To compare actual image identity with the pulled image, use `docker inspect ipaas-sync-<id> --format "{{.Image}}"` and the image ID from `docker image inspect` above. Inspect locally; redact business data before sharing runtime logs.

```sql
SELECT id, status, updated_at FROM sync_entities
WHERE id = '<sync-entity-id>';
```

For one_time: exit 0 -> completed; non-zero -> failed; uncertain -> provisioning. Conditional writes preserve an already terminal state; check `statusRecorded` and investigate any discrepancy. A failed runtime outcome causes Stage 2 to fail even if DB status was concurrently changed to completed.

**Deterministic-container restriction:** if `ipaas-sync-<id>` already exists with the old image, PE treats an image mismatch as reconciliation-required. It will not delete/recreate it to test the new image. Use a NEW demo entity, not a different image against the old ID. No container deletion is part of this procedure.

The observed `Cannot find module '@rajkamal29/adapter-connectwise'` failure is an OE/provider packaging issue, not a PE setup issue. Use this procedure to verify a newer image fixes it without modifying PE logic. Definitive exit 1 should be recorded as failed if the row remains provisioning.

## 26. Known runtime packaging issue

The dev-latest image was observed exiting 1 with `Cannot find module '@rajkamal29/adapter-connectwise'`. This is a separate OE/provider image issue and is not fixed here. A definitive exit 1 should now result in PE recording failed if the row is still provisioning.

The expected current manual proof may therefore be submitted -> provisioning -> failed. Verify claim logs, dispatch, runner execution, deterministic container exit, lifecycle log including exitCode/nextStatus/statusRecorded, and final SQL status. That validates provisioning ownership without claiming successful synchronization.

## 27. Compose compatibility

Compose v2.27.1 does not support `docker compose run --pull never`. Preflight intentionally uses `run --rm --no-deps ...` without that flag. Deployment explicitly pulls the digest-pinned image first. The later `compose up` retains `--pull never`, `--no-build`, `--no-deps` and the single service name. Do not revert this compatibility fix.

## 28. Windows PowerShell native stderr

Windows PowerShell 5.1 with ErrorActionPreference=Stop can treat native stderr as a terminating error. Compose emits normal progress on stderr even on exit 0. `Invoke-Docker` temporarily accommodates native stderr, captures output internally, restores the preference, and determines failure from LASTEXITCODE. External errors stay sanitized. Do not revert this handling. The native-failure test intentionally exits nonzero and resets LASTEXITCODE only after its assertions so PowerShell Core CI does not falsely fail.

## 29. Troubleshooting

| Symptom | Likely cause | Check | Fix |
| --- | --- | --- | --- |
| Runner not listening | Stopped process or disconnected registration | Runner terminal and repository Runners page | Start run.cmd under the correct account; follow GitHub registration guidance if needed. |
| Missing runner-local User setting | Wrong account, missing value or stale inherited environment | Four boolean presence checks under runner account | Set required User values; Ctrl+C runner, reopen PowerShell, restart run.cmd. |
| Docker unavailable / Windows container mode | Desktop stopped, wrong mode or no account access | docker info OSType and context endpoint | Start Desktop, select Linux containers and use an authorized account. |
| Shared DB/network missing | Infra not started, unhealthy DB or migrations missing | compose ps, network inspect, psql tables | Start ipaas.infra, wait healthy, apply its existing migrations; do not duplicate infrastructure. |
| PE container not running | CD failed or wrong host selected | CD result, docker ps -a, sanitized startup logs | Correct preflight/configuration failure and redeploy on the intended machine. |
| No polling logs | Old revision, wrong log level, busy batch or process failure | Revision, info level, state/restarts and DB connectivity | Deploy current PE, restore connectivity; allow active batch to drain before the next poll. |
| Workflow dispatch 404 | Missing main registration, absent dev workflow or inaccessible repository | Workflow on main/dev and token Actions permission | Keep registration on main and ref=dev; correct token access/approval. |
| GHCR/new image pull denied | Package access or authentication missing | Pull exact approved reference under runner account | Follow official GHCR authentication guidance; pre-pull permitted private runtime image. |
| Wrong OE image used | Stale Stage 1 catalogue or reused mutable tag | Dispatch reference, helper mapping, runtime Config.Image and image ID | Use unique approved tag; redeploy Stage 1 and align Stage 2 catalogue. |
| Existing deterministic runtime has another image | Old entity reused for a new image | Targeted inspect of existing runtime Config.Image | Create a fresh demo entity; do not delete/recreate old runtime. |
| Host cannot resolve ipaas-postgres | Container DNS name used on host | Which DB variable is mapped for the process | Host PE uses localhost URL; containers use Docker DNS URL. |
| compose run unknown flag --pull | Compose v2.27.1 incompatibility | Preflight arguments and deployed revision | Use current run without --pull; retain explicit digest pull and up --pull never. |
| Docker failure reported although container starts | PowerShell native stderr interpreted as failure | Native exit code and deployment revision | Use current exit-code-aware Invoke-Docker implementation. |
| Runtime exits with missing adapter-connectwise | OE/provider packaging defect | Runtime logs and exit code | Fix/publish image separately; test new approved tag with a new entity. PE records failed for definitive exit 1. |
| Wait timeout / status remains provisioning | Outcome uncertain, old PE revision or persistence failure | Runtime state, workflow diagnostics and statusRecorded | Keep provisioning while uncertain; reconcile an existing exited runtime as in section 25. No automatic retry/recreation. |

## 30. Security and production transition

Never commit PATs, DB passwords, encryption keys or real `.env` files. Never log secrets, dump complete Docker configuration, or put tokens in screenshots. Local User variables are temporary/demo storage, not a production secret manager. Docker administrators can inspect container environments. Restrict machine access and rotate exposed credentials.

Move back to GitHub-managed deployment configuration and managed secret storage for production, with explicit runner placement and package permissions. See [CD deployment details](CD_DEPLOYMENT.md). This runbook does not execute live changes: the SQL and workflow checks above are manual validation steps.
