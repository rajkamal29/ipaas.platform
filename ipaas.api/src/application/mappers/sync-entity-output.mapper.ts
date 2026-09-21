import type {
  SyncEntityOutput,
  SyncEntityReadOutput,
} from "../contracts/sync-entity.contracts";
import type { SyncEntity } from "../../domain/sync-entity/sync-entity";
import type { SyncState } from "../../domain/sync-state/sync-state";

export function toSyncEntityOutput(syncEntity: SyncEntity): SyncEntityOutput {
  return {
    id: syncEntity.id,
    syncRequestId: syncEntity.syncRequestId,
    entity: syncEntity.entity,
    syncType: syncEntity.syncType,
    status: syncEntity.status,
    createdAt: syncEntity.createdAt,
    updatedAt: syncEntity.updatedAt,
    intervalSeconds: syncEntity.intervalSeconds,
  };
}

export function toSyncEntityReadOutput(
  syncEntity: SyncEntity,
  syncState: SyncState | null,
): SyncEntityReadOutput {
  return {
    ...toSyncEntityOutput(syncEntity),
    lastRunStatus: syncState?.lastRunStatus ?? null,
    syncStateUpdatedAt: syncState?.updatedAt ?? null,
    failedCount: syncState?.failedCount ?? 0,
    retryCount: syncState?.retryCount ?? 0,
  };
}
