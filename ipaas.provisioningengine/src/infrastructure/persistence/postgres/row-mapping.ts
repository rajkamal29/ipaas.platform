import type { SyncEntity } from "../../../domain/entities/sync-entity.js";
import type { SyncRequest } from "../../../domain/entities/sync-request.js";
import {
  ENTITY_TYPES,
  PROVIDERS,
  SYNC_TYPES,
  SYNC_ENTITY_STATUSES,
} from "../../../domain/enums/platform-values.js";
import { uuid } from "../../../domain/value-objects/uuid.js";
import { DependencyError } from "../../../application/errors/provisioning-errors.js";

interface SyncRequestRow {
  readonly id: unknown;
  readonly tenant_id: unknown;
  readonly source: unknown;
  readonly target: unknown;
  readonly created_at: unknown;
}
interface SyncEntityRow {
  readonly id: unknown;
  readonly sync_request_id: unknown;
  readonly entity: unknown;
  readonly sync_type: unknown;
  readonly status: unknown;
  readonly interval_seconds: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new DependencyError("database");
  return value;
}
function member<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new DependencyError("database");
  return value as T;
}
function timestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(text(value));
  if (!Number.isFinite(date.getTime())) throw new DependencyError("database");
  return date.toISOString();
}
export function mapSyncRequest(row: Record<string, unknown>): SyncRequest {
  const data: SyncRequestRow = {
    id: row.id,
    tenant_id: row.tenant_id,
    source: row.source,
    target: row.target,
    created_at: row.created_at,
  };
  return {
    id: uuid(text(data.id)),
    tenantId: uuid(text(data.tenant_id)),
    source: member(data.source, PROVIDERS),
    target: member(data.target, PROVIDERS),
    createdAt: timestamp(data.created_at),
  };
}
export function mapSyncEntity(row: Record<string, unknown>): SyncEntity {
  const data: SyncEntityRow = {
    id: row.id,
    sync_request_id: row.sync_request_id,
    entity: row.entity,
    sync_type: row.sync_type,
    status: row.status,
    interval_seconds: row.interval_seconds,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  const syncType = member(data.sync_type, Object.values(SYNC_TYPES));
  const interval = data.interval_seconds;
  if (syncType === SYNC_TYPES.interval) {
    if (
      typeof interval !== "number" ||
      !Number.isInteger(interval) ||
      interval < 60 ||
      interval > 2147483647
    )
      throw new DependencyError("database");
  } else if (interval !== null) throw new DependencyError("database");
  return {
    id: uuid(text(data.id)),
    syncRequestId: uuid(text(data.sync_request_id)),
    entity: member(data.entity, ENTITY_TYPES),
    syncType,
    status: member(data.status, Object.values(SYNC_ENTITY_STATUSES)),
    intervalSeconds: interval as number | null,
    createdAt: timestamp(data.created_at),
    updatedAt: timestamp(data.updated_at),
  };
}
