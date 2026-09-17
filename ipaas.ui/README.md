# iPaaS UI

Standalone Angular application for the platform workspace. This foundation implements
the application shell (#8), schema-based repository/mock foundation (#9), and tenant/sync configuration UI (#10). It runs independently
of infrastructure, provider packages, and the orchestration engine.

## Prerequisites

- Node.js 24.18.0 and npm 11.16.0 are the validated local toolchain.
- Supported Node versions are declared in package.json; .nvmrc pins the validated version.
- Use a compatible Node installation before installing dependencies. The project enables
  engine-strict so unsupported toolchains fail early.

On Windows, if PATH selects an older NVM installation, select the existing compatible
installation for the current PowerShell session:

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
node --version
npm --version
```

## Development

Run from this directory:

```powershell
npm ci
npm start
```

Open http://localhost:4200. Tenant, Sync Request, and Sync Entity screens require the
Node API and PostgreSQL to be running. The development server proxies `/api` to
`http://localhost:3000`; the browser-facing API base path remains configurable through
the Angular environment. Use npm install when intentionally changing dependencies;
commit the resulting lockfile with those changes.

## Validation

```powershell
npm run build
npm run build:production
npm run build:development
npm test -- --watch=false
npm run lint
npm run typecheck
npm run format:check
```

Tests use the Angular CLI's Vitest runner and cover the root application, lazy routes,
default redirect, page titles, active navigation, not-found recovery, and navigation
focus behavior, tenant/request/entity creation, domain form validation, relationship filtering,
duplicate handling, invalid route contexts, and asynchronous page state.

## Structure

- src/app/app.ts: root router outlet only.
- src/app/core/layout: shell, header, and responsive navigation.
- src/app/core/config: typed configuration injection token and navigation definitions.
- src/app/core/errors: not-found page and safe repository/route feedback.
- src/app/features: lazy-loaded pages and page-scoped tenant, sync-request, and sync-entity facades.
- src/app/shared/ui: shared feedback, display labels, and feature placeholder.
- src/app/shared/forms: domain-to-reactive-form validation adapter.
- src/app/shared/state: signal-based async reads and submission state.
- src/app/domain: schema models, value sets, and runtime validation.
- src/app/data-access: async contracts, DI tokens, HTTP repositories, DTO mappers, and
  shared mocks retained for features outside Issue #13.
- src/environments: typed build-time configuration.
- src/styles: global design tokens and responsive configuration styles.

Components are standalone and use OnPush. The shell owns navigation visibility only;
it contains no domain state. Mobile navigation is an in-flow disclosure rather than a
modal: hidden links leave the tab order, Escape closes the disclosure, and successful
navigation closes it and moves focus to the main content. Route titles and aria-current
identify the current page.

HTTP DTOs and adapters are isolated from components and domain models. No empty
scaffolding is maintained.
Create pages use typed reactive forms with shared domain input validators.

## Routes

| Path                                                     | Page                             |
| -------------------------------------------------------- | -------------------------------- |
| /                                                        | Redirect to /overview            |
| /overview                                                | Workspace preview                |
| /tenants                                                 | Tenant list                      |
| /tenants/new                                             | Create tenant                    |
| /tenants/:tenantId                                       | Tenant detail and sync requests  |
| /tenants/:tenantId/sync-requests/new                     | Create sync request              |
| /tenants/:tenantId/sync-requests/:requestId              | Request detail and sync entities |
| /tenants/:tenantId/sync-requests/:requestId/entities/new | Add sync entity                  |
| /global-mappings                                         | Global mappings placeholder      |
| /canonical-schemas                                       | Canonical schemas placeholder    |
| Any unmatched path                                       | Not-found page within the shell  |

## Tenant and sync configuration

Pages call page-scoped facades, which use the existing repository DI tokens. A shared,
stateless context service checks UUIDs, missing records, and request ownership before
loading children or saving configuration. Route ownership checks establish consistent
navigation context; they are not authentication or authorization.

Async state handles loading, safe error feedback, retries, and stale responses when
route parameters change. Forms prevent duplicate submissions, preserve input after
failed writes, and navigate to the saved record on success. Leaving a page discards
its pending feedback/navigation, but does not cancel a repository write.

The input validators reuse the same rules as full domain records without fabricating
IDs or timestamps. The tenant form requires at least three non-whitespace characters;
accepted names are sent verbatim rather than silently trimmed. Duplicate names and
request/entity pairs are enforced by the API/database. Provider selections come from
the existing value sets; identical source/target providers remain permitted by the
schema.

Entity creation leaves status to the repository default. Interval schedules require
whole seconds from 60 through 2147483647. Switching to one-time or real-time clears the
interval to null. Already-configured entity choices are disabled; a duplicate arising
after the form loads still receives repository conflict feedback. Real-time remains
selectable with a "Not yet supported" notice. This UI saves configuration only and
does not trigger orchestration or runtime execution.

## Configuration and data access

Production is the default build configuration. Development replaces environment.ts
with environment.development.ts. Both configure HTTP mode and the relative `/api` base
path. Environment files are public browser configuration and must never contain
secrets. Production hosting must route `/api` to the Node API; local development uses
`proxy.conf.json`.

Tenant, Sync Request, and Sync Entity repository tokens bind to HTTP implementations.
Those adapters unwrap the API success envelope, map API DTOs to domain models, and
translate safe error envelopes into repository errors. Other feature repositories
remain mock-backed because their UI/API integration is outside Issue #13. Transport
concerns remain outside page components.

## Domain and repository foundation

Issue #9 adds eight readonly UI models under src/app/domain/models. Names use camelCase
at the UI boundary (for example tenantId maps to tenant_id). UUIDs are strings in
canonical hyphenated form; generated IDs use crypto.randomUUID(). Timestamps are
serialized strings; generated timestamps use UTC ISO 8601.

| Model                | PostgreSQL table        | Notes                                                  |
| -------------------- | ----------------------- | ------------------------------------------------------ |
| Tenant               | tenants                 | Identity and unique name                               |
| SyncRequest          | sync_requests           | Tenant-owned source/target pairing                     |
| SyncEntity           | sync_entities           | Entity lifecycle and discriminated sync schedule       |
| Credential           | credentials             | Safe metadata projection; no secret storage fields     |
| SyncState            | sync_state              | Nullable latest outcome, cursor, failed and retry JSON |
| CanonicalEntity      | canonical_entities      | Entity name/version and schema JSON                    |
| MappingProfile       | mapping_profiles        | Tenant override with active/version fields             |
| GlobalMappingProfile | global_mapping_profiles | Platform mapping default                               |

database-values.ts is the source for provider, entity, sync-type, lifecycle-status,
run-status, and direction constants and their literal unions. Lifecycle and last-run
status remain separate. real_time is a valid configuration value, not a claim that
this UI can execute it.

JsonValue is a recursive readonly JSON type. It does not prescribe a mapping-builder,
canonical-schema, cursor, or failure-entry structure. Required JSONB properties must
be present; a JSON literal null is permitted by PostgreSQL JSONB. For nullable cursor,
the UI intentionally collapses SQL NULL and JSON null into the same null representation.
A future API adapter must preserve required JSONB null as JSON null rather than SQL NULL.

### Contracts and dependency injection

Components/facades should inject tokens from data-access/tokens/repository.tokens.ts.
They must not import MockDataService or concrete mock repositories.

| Contract                       | Operations                        |
| ------------------------------ | --------------------------------- |
| TenantRepository               | list, get, create, update, delete |
| SyncRequestRepository          | list, get, create, update, delete |
| SyncEntityRepository           | list, get, create, update, delete |
| CredentialRepository           | list by tenant, getForProvider    |
| SyncStateRepository            | getForEntity                      |
| CanonicalEntityRepository      | list, get, create, update, delete |
| MappingProfileRepository       | CRUD, activate, resolveEffective  |
| GlobalMappingProfileRepository | CRUD, activate                    |

Contract files define create/update inputs and typed filters. Responses are UI model
snapshots. Every repository method returns a Promise; these contracts do not specify
HTTP endpoints or depend on Angular HttpClient.

Current API conventions, distinct from database constraints:

- get returns null for an absent row. update/delete/activate reject with not-found.
- list returns a detached readonly array; filters combine with AND. There is no
  pagination or promised server ordering yet.
- Updates replace the declared editable fields, rather than applying partial patches.
  IDs, creation timestamps, and parent IDs are not editable through these initial
  contracts. An ownership-transfer workflow has not been defined.
- Entity creation defaults status to submitted; mapping creation defaults isActive
  to true. Updates require those fields explicitly.
- Mock entity updates refresh updatedAt as an application convention. The migrations
  only set its insertion default and do not install an update trigger.
- Credential reads for an existing tenant derive configured/missing from row presence,
  not provider connectivity or token validity. An unknown tenant is not-found.
  Credential configuration/rotation is deferred until a backend secret-input contract
  exists. Sync state is engine-owned and read-only through its UI repository.
- RepositoryError exposes validation, conflict, not-found, network, and server codes,
  field validation issues, and an optional safe request ID. HTTP implementations
  translate failures into this boundary without exposing raw response objects.

app.config.ts registers the production repository providers once. Tenant, Sync
Request, and Sync Entity use HTTP; the out-of-scope repositories share one
MockDataService instance. Unit tests can override the same tokens with mock providers.

### Mock consistency and schema validation

Fixtures contain only synthetic tenants, provider configurations, mapping versions,
and state examples. They cover all five lifecycle values, all sync types, absent state,
null last-run fields, active entities with failed latest runs, inherited/customized
mappings, and missing credentials/defaults. Empty mapping rules and minimal canonical
JSON are illustrative fixture values, not production integration definitions.

The mock service owns the only in-memory database. It copies seed data, clones reads,
and validates a draft before committing a mutation. Failed writes leave the previous
snapshot intact. No artificial delay, localStorage persistence, network, or database
connection is involved. Reloading the app restores fixtures.

Validation mirrors these migration constraints:

- Required columns, supported text values, UUID fields, timestamps, booleans, and
  PostgreSQL 32-bit integer ranges.
- Interval sync requires integer intervalSeconds >= 60; one_time and real_time
  require null.
- Unique tenant names, request/entity pairs, tenant/provider credentials, per-entity
  state, canonical name/version pairs, and at most one active mapping per scoped key.
- Foreign keys and ON DELETE CASCADE for tenants, requests, entities, credentials,
  tenant mappings, and state. Global mappings and canonical schemas survive tenant deletion.
- JSON validation rejects undefined, non-finite numbers, functions, cycles, sparse
  arrays, and non-JSON objects before clone/commit.

The mocks do not add a nonblank tenant-name rule, positive version requirement,
source/target inequality, unique provider pairing, minimum child count, lifecycle
transition policy, unique mapping version, or canonical-version FK. None is enforced
by the migrations. This layer models the UI contract; it is not a complete emulator
of PostgreSQL input parsing, collation, timestamp ranges, or arbitrary-precision numbers.

### Effective mappings

resolveEffective queries the current shared snapshot on each call:

1. Active tenant override matching tenant/provider/entity/direction.
2. Otherwise the active global profile matching provider/entity/direction.
3. Otherwise { origin: 'missing', profile: null }.

Inactive tenant history does not block inheritance. No inherited profile is copied
into the tenant collection. Changing a global default is visible to inheriting tenants
on their next query.

Ordinary create/update rejects a competing active row with conflict. The explicit
activate operation atomically deactivates the existing row for the same scope/key and
activates the selected version. It leaves other tenants and mapping keys unchanged.

### Foundation tests

Unit tests cover scheduling and supported-value validation, CRUD and relationship
filters, FK/unique failures and rollback, cascades, credential metadata projection,
null and missing state, JSON snapshot isolation, mapping precedence/activation,
and replaceable DI bindings. Tests can override MOCK_DATA_SEED with a fresh synthetic
database before the service is instantiated; test setup never needs PostgreSQL.

## Production hosting

npm run build:production writes static files to dist/ipaas-ui/browser. Configure the
static host to serve index.html for application routes so direct links and reloads work.
Missing asset requests should remain 404s. No server-rendering runtime is required.
