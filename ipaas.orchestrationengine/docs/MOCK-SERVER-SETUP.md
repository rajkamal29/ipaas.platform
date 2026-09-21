# Mock Server Setup

Each developer builds and runs their own mock-server image and uses their own Orchestration Engine image. Run all commands from the `ipaas.orchestrationengine` directory in PowerShell.

## Prerequisites

- Docker Desktop is running.
- The `ipaas.platform` repository is available locally.
- The Orchestration Engine `.env` contains a valid `DATABASE_URL` and `ENCRYPTION_MASTER_KEY`.
- The database schema and required tenant, sync request, sync entity, mapping, and canonical-schema data already exist.
- An Orchestration Engine image is available locally or from a container registry.

The database must be reachable from Docker. When Postgres runs directly on the Windows host, use `host.docker.internal` instead of `localhost` in `DATABASE_URL`.

## 1. Build the mock-server image

```powershell
docker build --file Dockerfile.mock --tag ipaas-mock-server:latest .
```

Confirm that the image exists:

```powershell
docker image inspect ipaas-mock-server:latest
```

## 2. Create the shared Docker network

The mock server, credential-seeding container, and Orchestration Engine must use the same Docker network:

```powershell
docker network create ipaas-network 2>$null
```

The command can be run again safely when the network already exists.

## 3. Run the mock server

Remove an old mock-server container if one exists:

```powershell
docker rm --force ipaas-mock-server 2>$null
```

Start the current image:

```powershell
docker run --detach --name ipaas-mock-server --network ipaas-network --publish 4000:4000 ipaas-mock-server:latest
```

Verify the container and ConnectWise mock endpoint:

```powershell
docker logs ipaas-mock-server
```

The host uses `http://localhost:4000`. Other containers on `ipaas-network` must use:

```text
http://ipaas-mock-server:4000
```

## 4. Select the Orchestration Engine image

Each developer sets `$orchImage` to the image available on their machine. For example:

```powershell
$orchImage = 'ghcr.io/rajkamal29/ipaas-orchestration-engine:dev-latest'
```

Confirm that Docker can find it:

```powershell
docker image inspect $orchImage
```

## 5. Seed mock provider credentials

The Orchestration Engine loads ConnectWise and Keka credentials from the database. Run the seed for every tenant that will use the mock server.

Set the URL that containers use to reach the mock server:

```powershell
$mockBase = 'http://ipaas-mock-server:4000'
```

Replace the example values below with tenant IDs from your own database:

```powershell
$tenantIds = @(
  'your-first-tenant-id',
  'your-second-tenant-id'
)

foreach ($tenantId in $tenantIds) {
  docker run --rm `
    --network ipaas-network `
    --env-file .env `
    --entrypoint node `
    --mount "type=bind,source=$PWD\scripts\seed-mock-credentials.js,target=/app/scripts/seed-mock-credentials.js,readonly" `
    $orchImage `
    scripts/seed-mock-credentials.js `
    $tenantId `
    $mockBase
}
```

The seed uses an upsert, so it is safe to run again after rebuilding the mock server or changing its URL. Seeding is not required when the tenant's database credentials already point to `http://ipaas-mock-server:4000` and contain the expected mock values.

## 6. Seed the global client mappings

Run the global mapping seed once for the database. It creates or updates the canonical client schema, ConnectWise inbound client mapping, and Keka outbound client mapping. It is platform-level data, so it does not run inside the tenant loop and does not accept a tenant ID.

```powershell
docker run --rm `
  --network ipaas-network `
  --env-file .env `
  --entrypoint node `
  --mount "type=bind,source=$PWD\scripts\seed-global-mapping.js,target=/app/scripts/seed-global-mapping.js,readonly" `
  $orchImage `
  scripts/seed-global-mapping.js
```

This seed also uses upserts and is safe to run again.

## 7. Run the Orchestration Engine

```powershell
docker run --rm `
  --network ipaas-network `
  --env-file .env `
  $orchImage
```

The Orchestration Engine loads the configured tenants and sync entities from the database, performs one orchestration sweep, writes its logs to the terminal, and exits.

## 8. Check the mock-server logs

```powershell
docker logs ipaas-mock-server
```

To follow requests while running the Orchestration Engine in another terminal:

```powershell
docker logs --follow ipaas-mock-server
```

## Troubleshooting

### The Orchestration Engine reports `fetch failed`

Confirm that both containers use `ipaas-network`:

```powershell
docker network inspect ipaas-network --format '{{range .Containers}}{{println .Name}}{{end}}'
```

Confirm that database provider credentials use `http://ipaas-mock-server:4000`, not `localhost` or a Markdown-formatted link.

### Credential seeding reports a database timeout

The `DATABASE_URL` supplied through `.env` is not reachable from the temporary Docker container. Verify the database host and port. For Postgres running on the Windows host, use `host.docker.internal` as the hostname.

### Docker reports that the mock-server name is already in use

```powershell
docker rm --force ipaas-mock-server
```

Then run the mock-server command again.

## Stop the mock server

```powershell
docker stop ipaas-mock-server
docker rm ipaas-mock-server
```
