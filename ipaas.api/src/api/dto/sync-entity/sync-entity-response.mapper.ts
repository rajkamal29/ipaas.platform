import type {
  SyncEntityOutput,
  SyncEntityReadOutput,
} from "../../../application/contracts/sync-entity.contracts";
import type {
  SyncEntityReadResponseDto,
  SyncEntityResponseDto,
} from "./sync-entity-response.dto";

export function toSyncEntityResponse(
  syncEntity: SyncEntityOutput,
): SyncEntityResponseDto {
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

export function toSyncEntityReadResponse(
  syncEntity: SyncEntityReadOutput,
): SyncEntityReadResponseDto {
  return {
    ...toSyncEntityResponse(syncEntity),
    lastRunStatus: syncEntity.lastRunStatus,
    syncStateUpdatedAt: syncEntity.syncStateUpdatedAt,
    failedCount: syncEntity.failedCount,
    retryCount: syncEntity.retryCount,
  };
}
