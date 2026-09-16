import type { SyncEntityOutput } from "../../../application/contracts/sync-entity.contracts";
import type { SyncEntityResponseDto } from "./sync-entity-response.dto";

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
