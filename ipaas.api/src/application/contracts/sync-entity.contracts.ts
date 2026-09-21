import type {
  EntityType,
  SyncEntityStatus,
  SyncSchedule,
  SyncType,
} from "../../domain/sync-entity/sync-entity";
import type { SyncRunStatus } from "../../domain/sync-state/sync-state";

export type CreateSyncEntityInput = SyncSchedule & {
  readonly entity: EntityType;
  readonly status?: SyncEntityStatus;
};

export interface CreateSyncEntityRequest {
  readonly body: unknown;
}

export type UpdateSyncEntityInput = SyncSchedule & {
  readonly entity: EntityType;
  readonly status: SyncEntityStatus;
};

export interface UpdateSyncEntityRequest {
  readonly body: unknown;
}

export interface SyncEntityOutput {
  readonly id: string;
  readonly syncRequestId: string;
  readonly entity: EntityType;
  readonly syncType: SyncType;
  readonly status: SyncEntityStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly intervalSeconds: number | null;
}

export interface SyncEntityReadOutput extends SyncEntityOutput {
  readonly lastRunStatus: SyncRunStatus | null;
  readonly syncStateUpdatedAt: string | null;
  readonly failedCount: number;
  readonly retryCount: number;
}
