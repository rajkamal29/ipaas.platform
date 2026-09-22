import {
  ENTITY_TYPES,
  PROVIDERS,
  SYNC_ENTITY_STATUSES,
  SYNC_RUN_STATUSES,
  SYNC_TYPES,
  EntityType,
  Provider,
  SyncEntityStatus,
  SyncRunStatus,
  SyncType,
} from '../../domain/value-sets/database-values';
import type { Tenant } from '../../domain/models/tenant';
import type { SyncEntityRead } from '../../domain/models/sync-entity';

export const PROVIDER_LABELS: Readonly<Record<Provider, string>> = {
  [PROVIDERS.connectwise]: 'ConnectWise',
  [PROVIDERS.keka]: 'Keka',
};
export const ENTITY_LABELS: Readonly<Record<EntityType, string>> = {
  [ENTITY_TYPES.client]: 'Client',
  [ENTITY_TYPES.project]: 'Project',
  [ENTITY_TYPES.timesheet]: 'Timesheet',
};
export const SYNC_TYPE_LABELS: Readonly<Record<SyncType, string>> = {
  [SYNC_TYPES.oneTime]: 'One time',
  [SYNC_TYPES.interval]: 'Interval',
  [SYNC_TYPES.realTime]: 'Real time',
};
export const STATUS_LABELS: Readonly<Record<SyncEntityStatus, string>> = {
  [SYNC_ENTITY_STATUSES.submitted]: 'Submitted',
  [SYNC_ENTITY_STATUSES.provisioning]: 'Provisioning',
  [SYNC_ENTITY_STATUSES.active]: 'Active',
  [SYNC_ENTITY_STATUSES.completed]: 'Completed',
  [SYNC_ENTITY_STATUSES.failed]: 'Failed',
};
export const SYNC_RUN_STATUS_LABELS: Readonly<Record<SyncRunStatus, string>> = {
  [SYNC_RUN_STATUSES.success]: 'Success',
  [SYNC_RUN_STATUSES.failed]: 'Failed',
};

export function executionStatusLabel(
  entity: Pick<SyncEntityRead, 'status' | 'lastRunStatus'>,
): string {
  if (entity.lastRunStatus !== null) return SYNC_RUN_STATUS_LABELS[entity.lastRunStatus];
  const provisioningStatus = entity.status;
  if (provisioningStatus === SYNC_ENTITY_STATUSES.provisioning) return 'Not started';
  if (provisioningStatus === SYNC_ENTITY_STATUSES.completed) return 'Running';
  return 'Not started';
}

export const REAL_TIME_NOTICE =
  'Real-time sync is not yet supported by the engine. You can save this configuration, but it will not execute.';

export function tenantLabel(tenant: Tenant): string {
  return tenant.name.trim() ? tenant.name : 'Unnamed tenant';
}
