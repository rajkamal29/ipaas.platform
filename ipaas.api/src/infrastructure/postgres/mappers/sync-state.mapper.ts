import type {
  SyncRunStatus,
  SyncState,
} from "../../../domain/sync-state/sync-state";

export interface SyncStateRow {
  readonly sync_entity_id: string;
  readonly last_run_status: SyncRunStatus | null;
  readonly updated_at: Date;
  readonly failed: unknown;
  readonly retry: unknown;
}

function collectionCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function mapSyncState(row: SyncStateRow): SyncState {
  return {
    syncEntityId: row.sync_entity_id,
    lastRunStatus: row.last_run_status,
    updatedAt: row.updated_at.toISOString(),
    failedCount: collectionCount(row.failed),
    retryCount: collectionCount(row.retry),
  };
}
