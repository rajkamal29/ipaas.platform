import type { SyncEntityOutput } from "../contracts/sync-entity.contracts";
import type { SyncEntity } from "../../domain/sync-entity/sync-entity";

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
