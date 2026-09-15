# Database

The Provisioning Engine consumes the shared PostgreSQL schema owned by `../ipaas.infra`.
It must not create or migrate its own copy of the schema. Run platform migrations from
`ipaas.infra`, then verify compatibility from this module:

```powershell
cd ../ipaas.infra
npm run migrate:up

cd ../ipaas.provisioningengine
$env:DATABASE_URL = "postgres://ipaas:<password>@localhost:5432/ipaas_platform"
npm run db:verify-schema
```

The compatibility check covers all eight current platform tables and the columns defined
by the authoritative migrations. Provisioning work is scoped to `sync_entities`: the
future worker will claim `submitted` rows, use the parent `sync_requests` row to resolve
the runtime image, and pass only `SYNC_ENTITY_ID` plus platform secrets to an Orchestration
Engine invocation.

