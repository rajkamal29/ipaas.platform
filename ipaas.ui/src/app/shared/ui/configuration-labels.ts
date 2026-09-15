import {
  ENTITY_TYPES,
  PROVIDERS,
  SYNC_ENTITY_STATUSES,
  SYNC_TYPES,
  EntityType,
  Provider,
  SyncEntityStatus,
  SyncType,
} from '../../domain/value-sets/database-values';
import type { Tenant } from '../../domain/models/tenant';

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
export const REAL_TIME_NOTICE =
  'Real-time sync is not yet supported by the engine. You can save this configuration, but it will not execute.';

export function tenantLabel(tenant: Tenant): string {
  return tenant.name.trim() ? tenant.name : 'Unnamed tenant';
}
