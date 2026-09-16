export const ENTITY_TYPES = ["client", "project", "timesheet"] as const;
export const SYNC_TYPES = ["real_time", "interval", "one_time"] as const;
export const SYNC_ENTITY_STATUSES = [
  "submitted",
  "provisioning",
  "active",
  "completed",
  "failed",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];
export type SyncType = (typeof SYNC_TYPES)[number];
export type SyncEntityStatus = (typeof SYNC_ENTITY_STATUSES)[number];

export type SyncSchedule =
  | { readonly syncType: "interval"; readonly intervalSeconds: number }
  | {
      readonly syncType: "real_time" | "one_time";
      readonly intervalSeconds: null;
    };

export type SyncEntity = SyncSchedule & {
  readonly id: string;
  readonly syncRequestId: string;
  readonly entity: EntityType;
  readonly status: SyncEntityStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
};
