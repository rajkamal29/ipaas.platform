import type {
  EntityType,
  SyncEntity,
  SyncEntityStatus,
  SyncType,
} from "../../../domain/sync-entity/sync-entity";

export interface SyncEntityRow {
  readonly id: string;
  readonly sync_request_id: string;
  readonly entity: EntityType;
  readonly sync_type: SyncType;
  readonly status: SyncEntityStatus;
  readonly interval_seconds: number | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export function mapSyncEntity(row: SyncEntityRow): SyncEntity {
  const common = {
    id: row.id,
    syncRequestId: row.sync_request_id,
    entity: row.entity,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
  if (row.sync_type === "interval") {
    if (row.interval_seconds === null)
      throw new Error("Invalid interval row returned by PostgreSQL.");
    return {
      ...common,
      syncType: row.sync_type,
      intervalSeconds: row.interval_seconds,
    };
  }
  return { ...common, syncType: row.sync_type, intervalSeconds: null };
}
