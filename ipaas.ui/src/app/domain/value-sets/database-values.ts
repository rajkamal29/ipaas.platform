export const PROVIDERS = { connectwise: 'connectwise', keka: 'keka' } as const;
export type Provider = (typeof PROVIDERS)[keyof typeof PROVIDERS];

export const ENTITY_TYPES = {
  client: 'client',
  project: 'project',
  timesheet: 'timesheet',
} as const;
export type EntityType = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];

export const SYNC_TYPES = {
  realTime: 'real_time',
  interval: 'interval',
  oneTime: 'one_time',
} as const;
export type SyncType = (typeof SYNC_TYPES)[keyof typeof SYNC_TYPES];

export const SYNC_ENTITY_STATUSES = {
  submitted: 'submitted',
  provisioning: 'provisioning',
  active: 'active',
  completed: 'completed',
  failed: 'failed',
} as const;
export type SyncEntityStatus = (typeof SYNC_ENTITY_STATUSES)[keyof typeof SYNC_ENTITY_STATUSES];

export const SYNC_RUN_STATUSES = { success: 'success', failed: 'failed' } as const;
export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[keyof typeof SYNC_RUN_STATUSES];

export const MAPPING_DIRECTIONS = { inbound: 'inbound', outbound: 'outbound' } as const;
export type MappingDirection = (typeof MAPPING_DIRECTIONS)[keyof typeof MAPPING_DIRECTIONS];
