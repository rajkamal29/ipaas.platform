# Local Windows self-hosted runner setup

This runbook describes the temporary local-demo configuration on `dev`. It uses runner-local Windows environment variables: no GitHub Environment, repository Secrets, or repository Variables are required for this mode. Restore GitHub-managed configuration and managed secrets before production use.

## 1. Architecture: two separate Provisioning Engine executions

Stage 1: push/merge to dev -> CI publishes PE image -> reusable CD -> Windows self-hosted runner -> Docker Desktop -> long-running `ipaas-provisioning-engine`. With `RUNTIME_PROVIDER=github`, it polls the shared database, atomically claims submitted entities as provisioning, and dispatches `provision-runtime.yml`.

Stage 2: that workflow runs an explicit PE process on the intended Windows runner with `RUNTIME_PROVIDER=docker`, `SYNC_ENTITY_ID`, and `EXPECTED_RUNTIME_IMAGE`. It creates `ipaas-sync-<syncEntityId>`, observes execution, and conditionally records the terminal lifecycle status. GitHub accepting dispatch is not execution completion.

`[self-hosted, Windows]` is only a selector. Configure runner placement so both stages reach the intended Docker daemon and shared network. Multiple eligible developer machines are not interchangeable. Placement is a deployment prerequisite, not an idempotency mechanism.

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

Open repository Settings -> Actions -> Runners -> New self-hosted runner -> Windows. Follow GitHub's generated download/configuration commands in `C:\actions-runner`. Registration tokens are temporary; do not commit them. Then:

```powershell
cd C:\actions-runner
.\run.cmd
```

Expect `Connected to GitHub` and `Listening for Jobs`. Interactive mode under the Docker Desktop user is preferred for this demo. A service account may have different User variables and no access to that user's Docker daemon. Do not run untrusted pull-request code on a privileged local runner.

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

Idle cycles emit `Provisioning poll started` and `Provisioning poll completed` with `claimedCount=0`. Work cycles additionally emit `Provisioning batch claimed`, `Provisioning requested` with `syncEntityId`, `GitHub dispatch accepted`, `Provisioning request handled`, and `Provisioning batch drained`. Startup includes provider, poll interval, batch size and concurrency; defaults remain 120000 ms, 10 and 5.

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

## 26. Known runtime packaging issue

The dev-latest image was observed exiting 1 with `Cannot find module '@rajkamal29/adapter-connectwise'`. This is a separate OE/provider image issue and is not fixed here. A definitive exit 1 should now result in PE recording failed if the row is still provisioning.

The expected current manual proof may therefore be submitted -> provisioning -> failed. Verify claim logs, dispatch, runner execution, deterministic container exit, lifecycle log including exitCode/nextStatus/statusRecorded, and final SQL status. That validates provisioning ownership without claiming successful synchronization.

## 27. Compose compatibility

Compose v2.27.1 does not support `docker compose run --pull never`. Preflight intentionally uses `run --rm --no-deps ...` without that flag. Deployment explicitly pulls the digest-pinned image first. The later `compose up` retains `--pull never`, `--no-build`, `--no-deps` and the single service name. Do not revert this compatibility fix.

## 28. Windows PowerShell native stderr

Windows PowerShell 5.1 with ErrorActionPreference=Stop can treat native stderr as a terminating error. Compose emits normal progress on stderr even on exit 0. `Invoke-Docker` temporarily accommodates native stderr, captures output internally, restores the preference, and determines failure from LASTEXITCODE. External errors stay sanitized. Do not revert this handling. The native-failure test intentionally exits nonzero and resets LASTEXITCODE only after its assertions so PowerShell Core CI does not falsely fail.

## 29. Troubleshooting

| Symptom | Check / resolution |
| --- | --- |
| Missing runner-local setting | Set User variables for the actual runner account; restart runner and shell to refresh inherited settings. |
| Dispatch 404 | Register provision-runtime.yml on main, retain ref=dev; also verify token repository access, approval and Actions write permission. |
| compose run unknown flag --pull | Use current preflight without --pull; keep explicit digest pull. |
| Deployment reports failure although container starts | Use exit-code-aware Invoke-Docker; stderr progress alone is not failure. |
| Host cannot resolve ipaas-postgres | Use localhost URL for host PE, Docker DNS URL for container processes. |
| Missing adapter-connectwise, exit 1 | Separate OE/provider packaging fix; definitive lifecycle should become failed. |
| Exited runtime but row provisioning | Check deployed PE revision, explicit workflow lifecycle logs, timeout and conditional persistence; reconcile existing exited container as described above. |
| No visible idle poll logs | Confirm this revision and info log level; check container/restarts/DB and busy-batch duration. |
| Docker unavailable or Windows container mode | Start Docker Desktop, select Linux containers, verify runner account and endpoint access. |
| Missing network/schema or preflight failure | Start infra, wait healthy, apply its migrations; confirm both DB URLs point to the same shared database. |
| GHCR denied | Verify repository package access for CD token and runner-account access to private runtime images. |
| Wait timeout, runtime still running | Keep provisioning; investigate execution, then reconcile only after definitive exit. Never recreate it. |

## 30. Security and production transition

Never commit PATs, DB passwords, encryption keys or real `.env` files. Never log secrets, dump complete Docker configuration, or put tokens in screenshots. Local User variables are temporary/demo storage, not a production secret manager. Docker administrators can inspect container environments. Restrict machine access and rotate exposed credentials.

Move back to GitHub-managed deployment configuration and managed secret storage for production, with explicit runner placement and package permissions. See [CD deployment details](CD_DEPLOYMENT.md). This runbook does not execute live changes: the SQL and workflow checks above are manual validation steps.
