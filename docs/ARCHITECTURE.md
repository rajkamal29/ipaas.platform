# iPaaS Platform — High-Level Design (Architecture)

Status: Draft — pending real capacity inputs and sign-off on open items (Section 6)

## 1. Overview

An Integration Platform as a Service (iPaaS) that replaces bespoke, per-client integration builds with a reusable platform: a canonical data model that every connector maps to and from, a common connector framework, and configuration-driven field mapping that clients themselves configure through a UI. Built on open-source tooling where it clearly fits, custom-built where it doesn't, starting on local Docker and designed to be cloud-agnostic from day one.

---

## 2. Scope

### 2.1 Problem Statement

Integrations with third-party systems are typically built individually per client — standalone, one-off code with no shared pattern reused across engagements. Each new integration re-solves the same problems (authentication, retry/resilience, field mapping, state management) from scratch. This doesn't scale: cost and time per integration stays roughly constant no matter how many have been built before.

### 2.2 Goals (In Scope)

- Client-facing UI for connector selection, credential authorization, and **client-configurable** canonical field mapping
- Three sync modes: scheduled background jobs, one-time push, and event-driven/real-time sync
- Durable state management and automatic retry for failed syncs
- Logging, monitoring, and alerting across all sync activity
- **Persisted canonical data** on the platform side (not pass-through) — supports incremental diffing where source APIs lack native change-tracking, and makes synced data queryable
- Multi-tenancy via shared Postgres (`tenant_id`-scoped rows) combined with per-tenant compute isolation — each active tenant runs its own Orchestration Engine process/container, provisioned automatically from a shared container image
- Cloud-agnostic deployment — local Docker Compose now, portable to any Kubernetes-capable cloud later

### 2.3 Non-Goals (Out of Scope, this phase)

- Enterprise SSO / advanced RBAC — basic JWT + role-based access only
- Multi-region / active-active deployment
- A full downstream data warehouse or BI layer on top of synced data
- A public marketplace of third-party-built connectors
- Public developer API / API gateway (deferred until a real need emerges)
- Security hardening maturity (compliance certifications, field-level encryption) beyond baseline credential encryption

### 2.4 Key Decisions Carried From Design Discussion

| Decision | Choice | Rationale |
|---|---|---|
| Cloud strategy | Cloud-agnostic, Docker-first | Avoid single-cloud lock-in from day one |
| Language | Node.js / TypeScript, full stack | One language across API, orchestration/workers, and UI — simplifies hiring and code-sharing regardless of the orchestration approach |
| Frontend framework | Angular | Decided during MVP planning, superseding the Next.js placeholder used earlier in design discussion |
| Field mapping ownership | Client-configurable | Differentiator for this platform — diverges from the reference architecture reviewed earlier, which kept mapping engineering-only |
| Data persistence | Canonical data persisted, not pass-through | Enables incremental diffing and queryable synced data (see Section 3) |
| Multi-tenancy model | Shared Postgres (`tenant_id`-scoped rows) + per-tenant compute | Revised 2026-08-25 from the original shared-runtime-only decision, once self-service tenant onboarding became a goal — a dedicated Orchestration Engine process/container per tenant gives blast-radius isolation and sidesteps multi-process work-claiming (each process only ever touches its own tenant's rows); keeping one shared database avoids N migrations / N credential stores |
| Tenant environment provisioning | Provisioning Engine selects a container image and triggers CI/CD to stand up each tenant's environment | Required once tenants configure themselves through the UI rather than engineering hand-provisioning each one; see the new Provisioning Engine component (Section 4.1) |
| Sync Type (v1) | One-way only — source→target or target→source, tenant's choice | Two-way sync needs a conflict-resolution rule and loop-prevention design that hasn't been done yet; deliberately parked rather than exposed half-built |
| OAuth/credential acquisition | Custom, per-connector adapters | Each connector implements its own auth handshake (API key, OAuth, client-credentials, etc. as the system requires); credentials always land in our own encrypted store |
| Orchestration | Custom (Postgres-checkpointed) | Built during the OculusIT POC in place of Temporal — a paginated fetch/retry/checkpoint loop against a `sync_state` table gives durable-enough execution for this workload's scale without operating a separate Temporal cluster; `node-cron` drives the scheduled trigger |

### 2.5 Assumptions

- Illustrative target scale: 500 tenants, 2 connectors/tenant, 5 entities/connector — **placeholders**, to be replaced with real figures (see Section 6)
- Docker available locally now; a Kubernetes-capable environment is assumed for the later cloud phase
- Team is comfortable standardizing on a single-language (Node/TypeScript) stack

---

## 3. Capacity Estimation (Back-of-the-Envelope)

All figures below are illustrative placeholders, not committed targets — treat them as directional inputs to design decisions, to be re-run once real tenant volume is known.

### 3.1 Inputs

| Assumption | Value |
|---|---|
| Tenants at scale | 500 |
| Connectors per tenant | 2 (avg) |
| Entities per connector | 5 |
| Sync cadence (scheduled) | Every 15 minutes |
| Records touched per sync run | ~500 (incremental) |
| Average record payload size | 2 KB |
| Current-state records per canonical entity per tenant | ~5,000 |
| Daily change rate (typical CRM-like data) | ~2% of records/day |

### 3.2 Compute / Throughput

| Metric | Calculation | Result |
|---|---|---|
| Sync streams per tenant | 2 connectors × 5 entities | 10 |
| Sync run executions/tenant/day | 10 streams × 96 runs/day | 960 |
| Platform-wide sync run executions/day | 960 × 500 tenants | ~480,000/day (~5.5/sec avg) |
| Mapping engine throughput (peak) | 500 tenants × 10 streams × 500 records / 900 sec | ~2,780 records/sec |
| Outbound API calls/tenant/day | 10 streams × 96 runs × ~2 calls (paginated) | ~1,920/day |
| Platform-wide outbound calls/day | 1,920 × 500 | ~960,000/day (~11/sec avg) |
| Webhook events/day (illustrative, 10% event-driven) | 500 × 10% × ~1/min × 480 business min | ~24,000/day |

### 3.3 Storage

| Metric | Calculation | Result |
|---|---|---|
| Current-state records per tenant | 5 entities × 5,000 records | 25,000 |
| Current-state storage per tenant | 25,000 × 2 KB | ~50 MB |
| **Current-state storage at 500 tenants** | 50 MB × 500 | **~25 GB** |
| Changed records per tenant/day | 25,000 × 2% | ~500 |

### 3.4 Implications for Design

- **Custom orchestration handles this volume comfortably at the estimate stage.** ~5.5 sync starts/sec average is well within what one process per tenant can drive. The real risk is a **thundering herd at each 15-minute boundary** if all tenants' schedules align — mitigate with per-tenant jitter (hash tenant ID to an offset within the window), not over-provisioning. The per-tenant process/container model (Section 2.4) means multi-process work-claiming across tenants is a non-issue by construction; the open question is scaling within one large tenant's own workload, which isn't designed yet — see Section 6.
- **Mapping engine throughput is not a bottleneck** — sub-millisecond per record in Node with JSONata/ajv; each tenant's process runs its own mapping work independently.
- **Outbound API load is inherently distributed** across different third-party APIs per tenant/connector — no shared platform-wide rate limit bottleneck; per-connector rate limiting inside each adapter is the right granularity.
- **Postgres remains sufficient.** ~25 GB current-state data at 500 tenants does not require a data warehouse or NoSQL store.
- **Separate the current-state table from the audit trail.** Current-state storage is bounded by total record count; the audit log (change events, not full snapshots) grows unboundedly and needs a retention/archival policy — open item, Section 6.

---

## 4. High-Level Design

### 4.1 Component Overview

| Component | Responsibilities | Approach |
|---|---|---|
| **Client/Admin UI** | Tenant login; provider (source/target) selection; model selection scoped to the chosen provider; sync mode (interval / one-time / real-time) and sync type (one-way only, v1) configuration; credential setup trigger; canonical mapping configuration; read-only sync summaries, monitoring views | Custom — Angular/TypeScript |
| **API Layer** | Request validation, persistence, multi-tenancy & RBAC enforcement, triggers workflows | Custom — Node/TypeScript |
| **Connector & Auth Layer** | OAuth/credential acquisition, outbound API proxy (rate limiting, token injection), per-system connector I/O | Custom connector adapters, invoked directly by the custom orchestration loop |
| **Mapping & Transformation Engine** | Canonical schema registry, field mapping execution, transform functions, schema validation, mapping versioning, exposing which canonical models are available per provider | Custom engine, built on JSONata (expressions) + ajv (validation) — see dedicated LLD |
| **Orchestration Engine** | Background jobs, one-time push, event-driven/real-time sync, state management, retry, idempotency — runs as one process/container per tenant | Custom — Node.js fetch/retry/checkpoint loop, `sync_state` table for durability, typed-error-aware exponential backoff, `node-cron` for scheduled triggers |
| **Event & Queue Layer** | Inbound webhook receivers, event triggers into the orchestration layer, dead-letter queue | Custom webhook endpoints + BullMQ on Valkey (MVP) → NATS at scale |
| **Provisioning Engine** | Reads a tenant's saved configuration, selects the platform's container image, triggers the CI/CD pipeline to stand up that tenant's dedicated Orchestration Engine process/container | Custom — new component, not yet built; see Section 6 |
| **Data & Secrets Store** | Tenant config, canonical records (current-state + audit log), mapping definitions, sync state, credential storage | Postgres + Valkey (cache/queue) + custom encryption → Infisical later |
| **Observability & Ops** | Logging, monitoring, alerting, usage metering | `pino` → Loki; Prometheus/Grafana for metrics/dashboards; custom alerts → Grafana Alerting |
| **Platform/Infra** | Cloud-agnostic storage/secrets/queue abstraction, connector SDK/versioning, API gateway (deferred), CI/CD pipeline (builds and publishes the platform's container image) | Custom interfaces + adapters; GitHub Actions for CI/CD; Traefik/Kong later |

### 4.2 Architecture Diagram (Component Flow)

```
                         ┌─────────────────────┐
                         │   Client/Admin UI    │
                         │  (Angular/TS)        │
                         └──────────┬───────────┘
                                    │ HTTPS
                         ┌──────────▼───────────┐
                         │      API Layer        │◄──── JWT/RBAC, tenant scoping
                         │   (Node/TS)            │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │ Provisioning Engine    │  reads saved config,
                         │ (not yet built)        │  picks image, triggers CI/CD
                         └──────────┬───────────┘
                                    │ stands up, per tenant
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
   ┌──────────▼─────────┐ ┌─────────▼──────────┐ ┌────────▼─────────┐
   │ Connector & Auth    │ │ Orchestration       │ │ Data & Secrets   │
   │ Layer (custom      │◄┤ Engine (Custom,     ├►│ Store (Postgres, │
   │ adapters)          │ │ 1 process/container │ │ Valkey)          │
   │                     │ │ per tenant)         │ │                  │
   └──────────┬─────────┘ └─────────┬──────────┘ └────────┬─────────┘
              │                     │                     │
              │           ┌─────────▼──────────┐          │
              │           │ Mapping & Transform  │◄─────────┘
              │           │ Engine (JSONata/ajv) │
              │           └─────────┬──────────┘
              │                     │
   ┌──────────▼─────────┐ ┌─────────▼──────────┐
   │ Event & Queue Layer  │ │ Observability & Ops │
   │ (webhooks, BullMQ)   │ │ (pino, Loki,        │
   │                       │ │ Prometheus/Grafana) │
   └───────────────────────┘ └──────────────────────┘
```

### 4.3 Data Flow

**A. Client onboarding / configuration**
1. Client authenticates into the Admin UI (JWT + RBAC).
2. Selects a source and target provider/connector.
3. Selects which canonical models to sync, scoped to what the Mapping Engine exposes as available for that provider.
4. Initiates the connector's auth flow (OAuth, API key, or client-credentials, depending on the system) — resulting tokens/credentials are persisted into the platform's own encrypted store.
5. Client configures canonical field mapping through the UI; saved as a new, versioned mapping profile (`is_active: false` until validated via dry-run).
6. Client selects sync mode (interval / one-time / real-time) and sync type — **one-way only in v1** (source→target or target→source); two-way is parked, not offered (see Section 2.4).
7. Submission is validated and persisted by the API layer, which hands off to the Provisioning Engine (Step E) to bring the tenant's environment up.

**B. Inbound sync (source → canonical)**
1. A `node-cron` schedule or event trigger starts a sync run for a given tenant/connector/entity.
2. The sync run fetches data via the connector's adapter, using cursor-based incremental fetch where the source API supports it, or a diff against the last stored snapshot where it doesn't.
3. The raw payload is passed to the Mapping & Transformation Engine, which applies the active inbound mapping profile and validates the result against the canonical schema.
4. The canonical record is upserted into Postgres; a change event is written to the audit log if the record changed.
5. The sync run checkpoints its state/watermark to the `sync_state` table after every page — this, not a Temporal workflow history, is what makes a crash mid-run resumable.

**C. Outbound sync (canonical → target)**
1. Triggered after the inbound step (or independently, for canonical-only consumers).
2. The Mapping Engine applies the active outbound mapping profile to produce a target-shaped payload.
3. The connector's adapter writes to the target system.
4. On failure, the custom retry-with-backoff logic applies (typed-error-aware: retries rate limits, not auth or not-found errors); after retries are exhausted, the item is persisted to a tenant-scoped dead-letter table in the same Postgres instance, with the error reason and payload, for manual review. **This is a lightweight table, not a message-broker-backed queue** — it captures failures for review; it doesn't replay or route them. The full broker-backed dead-letter queue (Valkey/BullMQ) remains part of the Event & Queue Layer, not yet built — see Section 6.

**D. Event-driven / real-time sync — planned, not yet implemented**
1. An inbound webhook is received at a custom endpoint; signature verified.
2. The event is published to BullMQ (Valkey-backed) or NATS.
3. A sync run is triggered from the signal and processes the event through the same inbound/outbound mapping flow described above.

Only the scheduled and one-time-push modes exist today, for the Client entity. No webhook receivers, queue, or event-driven trigger path have been built — this section describes the intended design, not current behavior.

**E. Tenant environment provisioning — planned, not yet implemented**
1. Once configuration from Step A is persisted, the Provisioning Engine reads it.
2. It selects the platform's current container image from the registry (published by the Platform/Infra CI/CD pipeline).
3. It triggers the CI/CD pipeline to deploy a dedicated Orchestration Engine process/container for that tenant, parameterized with the tenant's ID and saved configuration.
4. That process registers its own `node-cron` schedule or event trigger and begins running the tenant's syncs — same Orchestration Engine logic described in B/C above, just running as an isolated instance per tenant rather than a shared process.

No provisioning happens automatically today — every tenant currently runs inside the one shared process described in Section 4.4, Phase 1. This section describes the target design.

### 4.4 Deployment View

**Phase 1 — Local Docker Compose**
Postgres · Node app (API, custom orchestration, connector adapters) — the actual runtime running today. The Angular UI hasn't been built yet (POC scope used seed scripts/API calls instead — see `OCULUSIT_POC_PLAN.md`), and Valkey/the Event & Queue Layer aren't stood up yet either. `docker-compose.yml` currently still defines `temporal`, `temporal-admin-tools`, and `temporal-ui` containers left over from before the custom-orchestration decision — nothing in the codebase talks to them; see Section 6.

**Phase 2 — Cloud-agnostic**
Docker Compose services move to Kubernetes manifests/Helm charts; Terraform for infrastructure-as-code across providers; storage/secrets/queue abstracted behind interfaces so Garage/SeaweedFS can be swapped for S3/GCS/Azure Blob without touching business logic. Infisical, NATS, and the full Prometheus/Grafana/Loki observability stack are added at this stage as real operational need emerges — not provisioned speculatively. This is also where per-tenant compute isolation becomes real: the Provisioning Engine deploys each tenant's Orchestration Engine as its own Kubernetes pod (or equivalent container instance) from a shared image, rather than the single shared process running in Phase 1 — one database throughout, compute isolated per tenant only from this phase onward.

### 4.5 Non-Functional Requirements

- **Scalability** — horizontal scaling via one Orchestration Engine process/container per tenant (Section 2.4), which sidesteps the original multi-process work-claiming problem since no two processes ever share a tenant's queue; per-tenant schedule jitter still applies to avoid synchronized load spikes at cadence boundaries. Not yet designed: scaling *within* a single large tenant's workload across more than one worker — out of scope until a tenant's volume actually needs it; see Section 6.
- **Reliability** — durable-enough execution via per-page Postgres checkpointing (`sync_state`) and typed-error-aware retry with backoff; a tenant-scoped dead-letter table captures records that exhaust retries (planned for Phase 2, Section 4.3.C) — the broker-backed dead-letter *queue* (replay, routing) is a separate, larger piece still not implemented (Event & Queue Layer, Section 6).
- **Security** — credentials encrypted at rest (custom AES-256-GCM initially, Infisical later); tenant isolation enforced at the data layer via `tenant_id` scoping on every query.
- **Portability** — no cloud-specific managed services in the core design; storage/secrets/queue sit behind interfaces specifically so the platform can move providers later.
- **Observability** — structured logging (`pino`, tagged with `syncRunId`/`tenantId`) provides run-level visibility from day one; a dedicated metrics/dashboard stack (Prometheus/Grafana/Loki) is deferred until real operational need — see Section 6.

---

## 5. Detailed (Low-Level) Design — Status

LLDs are maintained as separate, per-component documents. Three of these components were carried through the OculusIT POC well past the design stage — their LLD docs and their status lines below are stale about that; corrected here based on what's actually in the repo:

| Component | LLD Status |
|---|---|
| Data & Secrets Store | LLD drafted (`LLD-data-store.md`, still headed "no implementation yet" — stale). **Implemented**: schema migrated, credentials/canonical-records/audit-log/sync-state tables live, seed/round-trip verified (`DAY1-OPERATIONS.md`). |
| Connector & Auth Layer | LLD drafted and revised against real API responses (`LLD-connector-auth-layer.md`, three revisions — Nango was considered and dropped). **Implemented**: ConnectWise and Keka adapters both called live. Keka's `write()` path is mock-tested only, never run against the real API — verify before relying on it. |
| Mapping & Transformation Engine | LLD drafted (`LLD-mapping-engine.md`). **Implemented for the Client entity only** — ConnectWise-inbound and Keka-outbound mapping profiles exist; Project and Timesheet profiles have not been authored. |
| Orchestration Engine (Custom) | **No dedicated LLD file yet** — built directly during the POC (`lib/orchestration/`: checkpointed fetch/retry loop, `node-cron` scheduling) ahead of formal design docs. `LLD-orchestration-engine.md` should be formalized retroactively from the working code; see Section 6. |
| Event & Queue Layer | Not started — no LLD, no code. Webhooks, BullMQ/Valkey, and the dead-letter queue are all still design-only. |
| Provisioning Engine | Not started — no LLD, no code. Design-only (Section 4.1, 4.3.E); depends on the CI/CD pipeline existing first (also not started). |

---

## 6. Open Items

- Confirm real capacity inputs (tenant count, record volume, sync cadence) and re-run Section 3 — current figures are illustrative placeholders.
- Define the audit log retention/archival policy (unbounded growth, unlike the current-state table).
- Decide the API gateway adoption trigger (Traefik/Kong) once a public developer API is needed.
- Confirm adoption triggers for Infisical, NATS, and the Prometheus/Grafana/Loki stack — currently deferred until real operational need, not scheduled.
- Formalize `LLD-orchestration-engine.md` retroactively from the custom implementation already built (`lib/orchestration/`); produce `LLD-event-queue-layer.md` once that component starts.
- Remove the unused `temporal`, `temporal-admin-tools`, and `temporal-ui` containers from `docker-compose.yml` — leftover from before the custom-orchestration decision; nothing in the codebase uses them.
- Multi-process work-claiming is resolved *by design* now that each tenant gets its own Orchestration Engine process/container (Section 2.4) — no remaining action item, but flag if a single tenant's volume ever needs more than one worker (not designed).
- Author Project and Timesheet mapping profiles — the Mapping Engine currently only covers the Client entity.
- Validate Keka's `write()` path against the real API — it has only ever been mock-tested; `writeToKeka` defaults to `false` in the code specifically because of this.
- Build the Event & Queue Layer (webhooks, BullMQ/Valkey, broker-backed dead-letter queue) — event-driven sync is designed (Section 4.3.D) but not implemented; only scheduled and one-time-push modes exist today. Note: a lighter-weight dead-letter *table* (no broker, just persisting failed records for review) is now planned for Phase 2 — see Section 4.3.C — and is a smaller, separate piece of work from this item.
- Build the CI/CD pipeline — no `Dockerfile` and no `.github/` workflows exist in the repo yet; this is a prerequisite for the Provisioning Engine, which needs a published image to deploy.
- Design and build the Provisioning Engine (Section 4.1, 4.3.E) — reads tenant config, selects the image, triggers CI/CD to stand up that tenant's environment. Not started; formalize `LLD-provisioning-engine.md` once work begins.
- Decide the container registry and image versioning/rollback strategy the Provisioning Engine will use — not yet defined.
- Two-way sync (Sync Type) is intentionally parked (Section 2.4) — conflict resolution and loop-prevention need real design before it's exposed in the UI. Revisit when a use case actually needs it.

## 7. Reference

An earlier architecture (`ARB-iPaaS-Platform 3.docx`) was reviewed during design. It represents a different, already-built direction — single-cloud (Azure), polyglot (.NET + Node), with engineering-only field mapping and per-tenant isolated infrastructure (isolated compute *and* isolated data, per tenant). This document is a deliberate fresh, cloud-agnostic direction and diverges from it on cloud provider, language, and mapping ownership. Its process patterns (structured cost analysis, POC-based tool evaluation before adoption) informed how this document and the earlier tool discussions were structured.

Note the 2026-08-25 multi-tenancy revision (Section 2.4) is not a return to that earlier model — this platform isolates compute per tenant but keeps one shared database, rather than isolating both.
