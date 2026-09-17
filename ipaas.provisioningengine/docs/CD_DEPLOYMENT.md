# Provisioning Engine CD (issue #55)

## Responsibilities and flow

CI (`build-provisioning-engine.yml`) installs, typechecks, tests, builds and publishes
the service image. CD (`deploy-provisioning-engine.yml`) only pulls and deploys it;
it does not compile source or build an image.

```text
successful dev CI publication
  -> CD on [self-hosted, Windows] / local Docker Desktop (Linux containers)
  -> ipaas-provisioning-engine on existing ipaas-network
  -> no SYNC_ENTITY_ID: long-running DB polling
  -> RUNTIME_PROVIDER=github: dispatch provision-runtime.yml at ref dev
  -> existing self-hosted Windows executor, RUNTIME_PROVIDER=docker
  -> individual ipaas-sync-<syncEntityId> runtime
```

Polling, claims, lifecycle ownership, runtime idempotency, unsupported interval/real_time
behavior and reconciliation policy are unchanged. Shared DB/schema/network ownership
remains exclusively in ipaas.infra.

## Trigger, trust and image identity

A dev push runs verify -> image -> deploy. The image job depends on all verification
checks. The deploy job depends on successful image publication and calls
`./.github/workflows/deploy-provisioning-engine.yml` using workflow_call. The relative
reference uses the caller's commit, so automatic deployment does not require the CD
workflow to exist on main. There is no workflow_run trigger.

PRs never deploy. Manual CI dispatch publishes but does not deploy unless the operator
selects the boolean deploy input and branch dev. Other branches cannot deploy.

The image job exposes source_sha (full GITHUB_SHA), image_tag (the exact published
GHCR dev-<first-seven-characters> tag), and image_digest (build-push-action's output).
These are passed directly to reusable CD. No artifact upload/download or Actions API
selection is needed. dev-latest is published for convenience but never deployed.
CD validates SHA/tag/digest, pulls the digest from the fixed repository, verifies the
full image revision label and checks the running image ID and digest reference.
A temporary local JSON file bridges these inputs into the existing deployment script;
it is not an artifact and contains no secrets.

The entire dev CI/CD chain uses cancel-in-progress: false. This deliberately serializes
verification and publication too, avoiding cancellation of an active deployment through
its parent workflow. GitHub can replace pending runs; it does not guarantee FIFO order.
The reusable workflow also has its own distinct provisioning-engine-dev-deployment
concurrency group, shared with manual rollback, and never cancels an active deployment.
Manual rollback may be followed by a queued dev deployment; coordinate rollback with
pending CI runs. External/manual cancellation can still interrupt a job.

## Temporary local demo mode

Both CD and the per-entity runtime executor temporarily bypass GitHub Environments,
repository Actions Secrets and Variables.
The reusable workflow has no secret inputs, and environment: provisioning-dev is removed.
GHCR still uses the normal workflow GITHUB_TOKEN with packages: read; grant this repository
package access if necessary. Exact SHA/tag/digest handoff and all replacement checks remain.

The single deploy/local-demo.ps1 helper loads these runner-local values, in order:
User scope for the account running the runner, then Process scope, then Machine scope.
It rejects missing/blank settings by name without printing values, before invoking deployment.
In default deployment mode, it maps PLATFORM_RUNTIME_DATABASE_URL to both DATABASE_URL and RUNTIME_DATABASE_URL,
PLATFORM_ENCRYPTION_MASTER_KEY to ENCRYPTION_MASTER_KEY, and
PROVISIONING_GITHUB_DISPATCH_TOKEN to the service dispatch credential. Values are assigned
only to the deployment process environment, never GITHUB_ENV, metadata files or repository files.
The Docker child processes receive them; Docker administrators can inspect container configuration.
Do not enable PowerShell transcription/debug tracing around secret handling.

Stage 1 requires PLATFORM_RUNTIME_DATABASE_URL, PLATFORM_ENCRYPTION_MASTER_KEY and
PROVISIONING_GITHUB_DISPATCH_TOKEN; it does not require PLATFORM_DATABASE_URL.
Stage 2 calls the same helper with -Mode runtime and requires PLATFORM_DATABASE_URL,
PLATFORM_RUNTIME_DATABASE_URL and PLATFORM_ENCRYPTION_MASTER_KEY, without a dispatch token.
For Stage 2, PLATFORM_DATABASE_URL maps to the Windows process DATABASE_URL, while
PLATFORM_RUNTIME_DATABASE_URL maps to RUNTIME_DATABASE_URL for the Docker runtime container.
The host URL may use localhost/a host-reachable address; the container URL must reach the DB
on ipaas-network. These URLs are intentionally separate and must identify the same platform DB.

Run these commands locally **as the Windows account that runs the self-hosted runner**;
replace placeholders privately, never paste real values into this repository or workflow logs:

```powershell
[Environment]::SetEnvironmentVariable(
  "PLATFORM_DATABASE_URL", "<windows-host-reachable-db-url>", "User"
)
[Environment]::SetEnvironmentVariable(
  "PLATFORM_RUNTIME_DATABASE_URL", "<docker-network-reachable-db-url>", "User"
)
[Environment]::SetEnvironmentVariable(
  "PLATFORM_ENCRYPTION_MASTER_KEY", "<existing-platform-key>", "User"
)
[Environment]::SetEnvironmentVariable(
  "PROVISIONING_GITHUB_DISPATCH_TOKEN", "<github-dispatch-token>", "User"
)
```

The DB URL must reach the shared PostgreSQL service from ipaas-network. The key must be the
existing base64-encoded 32-byte platform key. The dispatch token should be a fine-grained PAT
restricted to this repository with Actions: write; track expiry and redeploy after rotation.
The job's short-lived GITHUB_TOKEN is only for GHCR, not the persistent service.

Restart the runner process/service after setting values. A service running as another account
cannot read your interactive user's User settings. Direct User-scope reads see registry updates,
but Process-scope fallback may remain stale until restart. Prefer the actual runner account's
User scope over broadly accessible machine settings. Never print the variables to verify them.

The helper centralizes these non-sensitive demo values:

```json
[{"source":"connectwise","target":"keka","registry":"GHCR","repository":"rajkamal29/ipaas-orchestration-engine","tag":"dev-latest"}]
```

RUNTIME_IMAGE_MAPPINGS_JSON resolves to
**ghcr.io/rajkamal29/ipaas-orchestration-engine:dev-latest**.
LOG_LEVEL=info, PROVISIONING_POLL_INTERVAL_MS=120000, PROVISIONING_POLL_BATCH_SIZE=10,
and PROVISIONING_MAX_CONCURRENCY=5 are fixed for the demo.
This mutable tag is the individual runtime image only; the Provisioning Engine CD image
remains pinned to the CI-published digest. GitHub owner/repository derive from the event;
RUNTIME_PROVIDER=github, workflow provision-runtime.yml and ref dev remain unchanged.

Before testing:
1. Merge the reviewed workflow changes into dev; automatic workflow_call needs no main copy.
2. Ensure the intended [self-hosted, Windows] runner account has access to local Docker Desktop,
   running in Linux-container mode, with Compose v2 installed. Keep Docker Desktop running.
3. Start shared infrastructure through ipaas.infra. ipaas-network and shared PostgreSQL must
   already exist. CD will not create them. Missing prerequisites fail before stopping the old service.
4. Configure the four runner-local variables above and restart the runner.
5. Allow GHCR package reads for this repository, and container HTTPS access to GitHub.
6. Trigger eligible dev CI, or manually run CI on dev with deploy=true. Do not deploy a PR.

The runtime executor keeps SYNC_ENTITY_ID and EXPECTED_RUNTIME_IMAGE from dispatch inputs,
RUNTIME_PROVIDER=docker and DOCKER_NETWORK=ipaas-network. Empty identity/image inputs fail
before npm start. It uses the local Docker Desktop named pipe; no polling or network creation
is added. Compose is needed by Stage 1 only. Both workflows must select the same intended host.

The orchestration image manifest was anonymously accessible (HTTP 200, 2026-09-17).
DockerClient.ensureImage inspects the local image first, then pulls anonymously on a cache miss.
No Stage 2 registry login or packages permission is added for this public demo image. Dockerode
pull does not read Docker CLI login configuration automatically. If the package becomes private,
add workflow-token packages: read authentication and an authenticated CLI pre-pull against the
same daemon (or explicit Docker API pull auth); docker/login-action alone is insufficient.
Do not add a registry PAT. A cached dev-latest image is reused by current application behavior;
ensure the intended demo image is available locally if that tag has changed.

The runtime dispatch workflow still must be registered on the default branch, with the updated
helper/workflow available on dev. Optional standalone manual CD likewise requires default-branch
registration; automatic reusable CD does not. This is GitHub workflow registration, not a
repository Secrets/Variables/Environment dependency. On a single runner, dispatched runtime jobs
queue until CD releases the runner. Provider credentials and valid tenant/request/entity records
must already exist in the platform database; these changes do not seed business data or prove
ConnectWise/Keka connectivity. No live deployment or sync is performed by validation.

To restore production configuration:
1. Restore environment: provisioning-dev on the deployment job. Create that GitHub Environment
   with trusted dev branch restrictions and any required reviewer protection.
2. Restore the three explicit workflow_call secret declarations and matching caller secret mappings.
   Put values in repository Actions Secrets (shared values remain available to the runtime executor).
3. Restore deployment-step secret mappings for DATABASE_URL/RUNTIME_DATABASE_URL,
   ENCRYPTION_MASTER_KEY and PROVISIONING_GITHUB_DISPATCH_TOKEN.
4. Restore vars.RUNTIME_IMAGE_MAPPINGS_JSON and optional logging/polling vars expressions.
   Configure repository Actions Variables; defaults remain info/120000/10/5.
5. Restore runtime workflow secret mappings for the distinct host/container DB URLs and key,
   plus vars.RUNTIME_IMAGE_MAPPINGS_JSON. Remove both helper invocations, helper and its tests.
   Keep deployment safety tests.
6. Redeploy and verify with GitHub-managed configuration before removing local stored copies.
Never commit .env files, print expanded Compose config or dump full docker inspect.

## Container configuration and replacement

Deployment uses **docker-compose.deploy.yml**, fixed project **ipaas-provisioning-dev**,
service **provisioning-engine**, container **ipaas-provisioning-engine**, restart policy
**unless-stopped**, and init: true. Existing docker-compose.yml remains the local-build
configuration. Do not merge the two Compose files for CD.

The complete application environment supplied by deployment Compose is:
DATABASE_URL, RUNTIME_DATABASE_URL, ENCRYPTION_MASTER_KEY, RUNTIME_IMAGE_MAPPINGS_JSON,
RUNTIME_PROVIDER=github, GITHUB_ACTIONS_API_BASE_URL, GITHUB_ACTIONS_OWNER,
GITHUB_ACTIONS_REPOSITORY, GITHUB_ACTIONS_WORKFLOW=provision-runtime.yml,
GITHUB_ACTIONS_REF=dev, GITHUB_TOKEN, LOG_LEVEL, PROVISIONING_POLL_INTERVAL_MS,
PROVISIONING_POLL_BATCH_SIZE and PROVISIONING_MAX_CONCURRENCY.

SYNC_ENTITY_ID is not declared or inherited from the host environment. Compose receives an
explicit empty env file to avoid local .env overrides. Preflight rejects an image that
contains SYNC_ENTITY_ID, even empty. The service has no Docker socket mount: Docker-specific
timeout/network settings remain with the separate runtime executor. No HTTP endpoint is added.

Deployment:
1. Validates metadata, local Docker endpoint, shared network and Compose configuration.
2. Refuses to replace a same-named container not owned by the dedicated Compose project.
3. Pulls the exact digest and verifies its full commit revision.
4. Runs a disposable preflight container to validate current application settings and the
   shared schema, without polling/claiming. Failure leaves the existing service running.
5. Gracefully stops only the old Provisioning Engine, then recreates only that service
   with --no-deps --no-build --pull never. It never uses down, prune or runtime-container deletion.
6. Verifies running state, zero restart count, digest reference and local image ID over
   six samples spanning 30 seconds. Only release identity is printed; native error output
   and container environments are not dumped. This is startup verification, not an ongoing
   health or future-dispatch guarantee.

Stop grace is max(900, ceil(batch/concurrency) * 120 + 60) seconds, recorded on the container
and in Compose. Replacement honors the larger of old and new recorded grace. The 120-second
per-item allowance covers the current GitHub adapter's 30-second dispatch timeout plus DB
operations; the extra allowance covers claim overhead. At default settings grace is
15 minutes; at batch=100/concurrency=1 it is 12060 seconds. The job has a 240-minute limit.
SIGTERM reaches Node through init; the worker drains committed work before closing its pool.
Docker may force termination only after the stop timeout; interrupted/ambiguous work retains
the existing reconciliation policy. Revisit this allowance if runtime timeouts change.

Pull/preflight failures do not stop the old service. Recreation/verification failure fails
the job explicitly; no automatic rollback is attempted. Other services and the external
network are untouched. A failed replacement may leave this service stopped; use manual
redeployment below. An existing container with an unrelated owner/name collision requires
operator reconciliation, not automatic removal.

## Manual redeployment / rollback

For standalone manual CD, satisfy the registration prerequisite above. Select Deploy
Provisioning Engine, Run workflow, branch dev. Supply source_sha (full 40-character SHA),
image_tag (full ghcr.io/<owner>/ipaas-provisioning-engine:dev-<short-sha>), and image_digest
(sha256:<64 hex characters>) from a prior successful CI publication/deployment summary.
The image must still exist in GHCR; no 90-day artifact retention dependency remains.
Operators must select a reviewed, successful release: this manual path does not query
CI history. SHA/tag consistency and the image's full revision label are still enforced,
and the immutable digest is verified after deployment. Reusing a tag alone is insufficient.

If manual workflow registration on main is unavailable, an authorized operator on the
same runner can use the reviewed deploy/deploy.ps1 with a temporary JSON metadata file
containing sourceSha, image and digest, plus -ExpectedSha and -RepositoryOwner. Supply
exactly the documented deployment environment and authenticate to GHCR without logging
credentials. Suspend/coordinate Actions deployments before direct use: the script itself
cannot acquire GitHub's concurrency lock. Prefer the manual workflow when available; environment approval protection is disabled during this demo.
Do not rerun the image build to recover an old digest. There is no automatic rollback.

## Validation

- npm ci; npm run typecheck; npm test; npm run build
- deploy/test-deploy.ps1: fake-Docker tests for successful replacement, first deployment,
  drain sizing, pull/preflight failures, foreign containers/remote daemons, recreation
  failure, verification failure and mismatched image metadata. It never touches Docker.
- Validate deployment Compose with safe placeholder environment values and config --quiet.
- Validate both workflow YAML files, dependency ordering, explicit outputs, dev/PR guards,
  permissions and distinct non-canceling concurrency groups.

A real Actions/GHCR deployment requires the setup above. Local static/mocked validation
does not establish that repository secrets, runner routing or package permissions are configured.

References: [reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows),
[workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run),
[GITHUB_TOKEN lifetime](https://docs.github.com/en/actions/concepts/security/github_token),
[workflow dispatch token permissions](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).
