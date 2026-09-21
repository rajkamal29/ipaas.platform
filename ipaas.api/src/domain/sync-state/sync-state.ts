export const SYNC_RUN_STATUSES = ["success", "failed"] as const;

export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[number];

export interface SyncState {
  readonly syncEntityId: string;
  readonly lastRunStatus: SyncRunStatus | null;
  readonly updatedAt: string;
  readonly failedCount: number;
  readonly retryCount: number;
}
