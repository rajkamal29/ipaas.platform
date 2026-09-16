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

## GitHub setup

1. Merge these changes into dev. Automatic reusable CD works with main remaining the
   default branch; promotion to main is not required for that call chain.
2. Create **provisioning-dev as a GitHub Environment**. The actual deployment job declares
   environment: provisioning-dev. Allow trusted dev deployments and configure required
   reviewers if desired. Review approval gates deployment before secrets are exposed.
3. Place the three required secrets below at repository scope. The caller passes them
   explicitly, not through secrets: inherit. Keep shared runtime settings at repository
   scope so the separate runtime executor can use them too. Environment secrets with the
   same names override passed values; avoid duplicate definitions unless intentional.
4. Repository variables are available to reusable workflows in this same repository.
   Optional deployment-specific variables may instead be set on provisioning-dev; those
   values are read by the deployment job after the environment is selected. Keep the
   shared RUNTIME_IMAGE_MAPPINGS_JSON at repository scope for both workflows.
5. Grant this repository Actions read access to the GHCR package if inheritance does not
   already provide it. CD requests contents: read and packages: read only. The image job
   separately has packages: write. No registry PAT is normally needed.
6. Ensure the intended Windows runner is online, its service account/user can access local
   Docker Desktop, Linux containers are enabled, and Docker Compose v2 is installed.
   [self-hosted, Windows] selects runners; constrain availability to the intended host.
   Docker Desktop must remain running after the job and be started after host reboot.
7. Start shared infrastructure through ipaas.infra. Existing ipaas-network and PostgreSQL
   must be reachable by the service. Missing daemon access, wrong container mode, missing
   network, or failed DB/schema preflight fails before stopping the old service.
8. For the optional standalone manual CD/rollback workflow_dispatch entry point to be
   available, its definition must also be registered on the default branch. This manual
   entry point has GitHub's default-branch limitation; automatic workflow_call does not.
   The existing per-entity provision-runtime.yml dispatch must likewise be registered.

### Secrets

| GitHub secret | CD use |
| --- | --- |
| PLATFORM_RUNTIME_DATABASE_URL | Both DATABASE_URL and RUNTIME_DATABASE_URL in the service; must reach the existing shared DB from ipaas-network |
| PLATFORM_ENCRYPTION_MASTER_KEY | Existing platform base64 32-byte key, required by current config |
| PROVISIONING_GITHUB_DISPATCH_TOKEN | Long-lived service dispatch credential, passed as container GITHUB_TOKEN |

The existing runtime executor also needs repository secret PLATFORM_DATABASE_URL (DB
address reachable from the Windows host), plus PLATFORM_RUNTIME_DATABASE_URL and
PLATFORM_ENCRYPTION_MASTER_KEY. CD does not repurpose the host-specific DB URL.

Use a fine-grained PAT limited to this repository with **Actions: write** for the service
dispatch credential. Set an expiry, monitor it, and rotate it by updating the secret and
redeploying. Current application code reads a static token; it cannot renew short-lived
GitHub App installation tokens. Do not pass the CD job's automatic GITHUB_TOKEN into the
service: that token expires after the job. The automatic token is used only for Actions
GHCR login, and login-action logs out after the job. Registry
credentials use a job-specific DOCKER_CONFIG, not the runner's normal Docker credentials.

Never commit .env files, print Compose's expanded environment, or dump full docker inspect.

### Variables

| GitHub variable | Required/default |
| --- | --- |
| RUNTIME_IMAGE_MAPPINGS_JSON | Required approved provider-pair runtime image catalogue; same catalogue used by the executor |
| PROVISIONING_LOG_LEVEL | Optional; info |
| PROVISIONING_POLL_INTERVAL_MS | Optional; 120000, allowed 1000–300000 |
| PROVISIONING_POLL_BATCH_SIZE | Optional; 10, allowed 1–100 |
| PROVISIONING_MAX_CONCURRENCY | Optional; 5, allowed 1–100 |

Repository owner/name are derived from the GitHub context, not separately maintained
variables. API URL is https://api.github.com, workflow is provision-runtime.yml, and
runtime workflow ref is dev.

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
cannot acquire GitHub's concurrency lock. Prefer the protected manual workflow when available.
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
