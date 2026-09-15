export const SYNC_TYPES = {
  realTime: "real_time",
  interval: "interval",
  oneTime: "one_time",
} as const;
export type SyncType = (typeof SYNC_TYPES)[keyof typeof SYNC_TYPES];
export const SYNC_ENTITY_STATUSES = {
  submitted: "submitted",
  provisioning: "provisioning",
  active: "active",
  completed: "completed",
  failed: "failed",
} as const;
export type SyncEntityStatus =
  (typeof SYNC_ENTITY_STATUSES)[keyof typeof SYNC_ENTITY_STATUSES];
export const ENTITY_TYPES = ["client", "project", "timesheet"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
export const PROVIDERS = ["connectwise", "keka"] as const;
export type Provider = (typeof PROVIDERS)[number];
