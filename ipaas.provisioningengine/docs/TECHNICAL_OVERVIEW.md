# Provisioning Engine architecture

The implementation and operational contract are documented in [the README](../README.md).
This document records the decisions that replaced the POC design in issue #18.

- Shared migrations remain exclusively in ipaas.infra. No provisioning tables are added.
- SyncEntity and SyncRequest are domain records. Runtime identity is the validated entity UUID.
- Application ports are transport-independent. PostgreSQL row shapes, SQL, Dockerode, HTTP
  payloads, and logging output remain in infrastructure.
- ProvisionSyncEntityUseCase receives only syncEntityId. Claimed-row admission belongs to
  the caller; automatic claiming/polling is reserved for #19.
- Conditional lifecycle writes avoid overwriting completion/failure from orchestration.
- One-time process exit is not interpreted as business completion.
- GitHub acceptance is not execution success; unknown outcomes require reconciliation.
- Interval active means a recurring trigger exists. The current one-shot adapters reject
  intervals; the application port supports a future recurring-ready implementation.
- Deterministic Docker identity is retained across retries. Existing containers are checked,
  not deleted. Distributed exactly-once behavior is not claimed.
- Configuration is validated once. Platform secrets stay behind the runtime adapter boundary.
- Explicit worker submissions are deduplicated while in flight and drained during shutdown.
- Verification scripts cannot fabricate tenant/integration identities.
- Unit tests cover use cases, adapters, validation, worker lifecycle, and dependency boundaries.

Issue #19 must supply row claiming, polling, recovery ownership, and safe retry coordination.
A recurring runtime adapter must be added before production interval schedules are enabled.
