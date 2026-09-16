import type {
  Provider,
  SyncRequest,
} from "../../../domain/sync-request/sync-request";

export interface SyncRequestRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly source: Provider;
  readonly target: Provider;
  readonly created_at: Date;
}

export function mapSyncRequest(row: SyncRequestRow): SyncRequest {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    source: row.source,
    target: row.target,
    createdAt: row.created_at.toISOString(),
  };
}
