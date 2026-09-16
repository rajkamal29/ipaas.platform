# Provisioning Engine architecture

The implementation and operational contract are documented in [the README](../README.md).
This document records the decisions that replaced the POC design in issue #18.

- Shared migrations remain exclusively in ipaas.infra. No provisioning tables are added.
- SyncEntity and SyncRequest are domain records. Runtime identity is the validated entity UUID.
- Application ports are transport-independent. PostgreSQL row shapes, SQL, Dockerode, HTTP
  payloads, and logging output remain in infrastructure.
- ProvisionSyncEntityUseCase receives only syncEntityId. Claimed-row admission belongs to
  the caller; #19 polling claims submitted rows through an application-facing repository port.
- Conditional lifecycle writes avoid overwriting completion/failure from orchestration.
- One-time process exit is not interpreted as business completion.
- GitHub acceptance is not execution success; unknown outcomes require reconciliation.
- Interval active means a recurring trigger exists. The current one-shot adapters reject
  intervals; the application port supports a future recurring-ready implementation.
- Deterministic Docker identity is retained across retries. Existing containers are checked,
  not deleted. Distributed exactly-once behavior is not claimed.
- GitHub Actions requires the selected self-hosted runner to reach the intended Docker
  daemon and participate in or reach the expected platform network where required. The
  daemon must provide the existing ipaas-network for runtime containers and shared DB access.
  [self-hosted, Windows] is only a selector; deployment configuration must resolve it to
  the correct host. Runner placement is a deployment prerequisite, not an application-level
  idempotency mechanism.
- Configuration is validated once. Platform secrets stay behind the runtime adapter boundary.
- Explicit worker submissions are deduplicated while in flight and drained during shutdown.
- Verification scripts cannot fabricate tenant/integration identities.
- Unit tests cover use cases, adapters, validation, worker lifecycle, and dependency boundaries.

Issue #19 implements bounded polling and atomic submitted -> provisioning claims using
short PostgreSQL transactions with FOR UPDATE SKIP LOCKED. COMMIT releases locks before
provisioning starts; competing instances skip locked rows and cannot re-claim committed
provisioning rows. Batch size, concurrency and interval are centrally validated.
The default polling interval is 120000 ms (2 minutes); its allowed range remains
1000–300000 ms.
Explicit SYNC_ENTITY_ID mode bypasses polling. Cycles do not overlap; failures are isolated
per entity and claim failures wait until the next cycle. Shutdown interrupts idle waits,
drains active claims and committed batches, then closes the pool.
All submitted types are claimed once; existing use-case/adapter behavior rejects unsupported
real_time and interval attempts. No recurrence or real-time execution is added.
Stale provisioning recovery, automatic requeue and retry coordination remain separate.
A recurring runtime adapter must be added before production interval schedules are enabled.
