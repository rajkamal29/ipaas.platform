import { SYNC_TYPES } from '../value-sets/database-values';
import type { EntityType, SyncEntityStatus, SyncType } from '../value-sets/database-values';

export type SyncSchedule =
  | { readonly syncType: typeof SYNC_TYPES.interval; readonly intervalSeconds: number }
  | {
      readonly syncType: Exclude<SyncType, typeof SYNC_TYPES.interval>;
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
