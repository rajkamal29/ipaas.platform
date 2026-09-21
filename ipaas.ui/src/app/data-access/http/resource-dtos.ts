import type { SyncEntity } from '../../domain/models/sync-entity';
import type { SyncRequest } from '../../domain/models/sync-request';
import type { Tenant } from '../../domain/models/tenant';

export type TenantDto = Tenant;
export type SyncRequestDto = SyncRequest;
export type SyncEntityDto = SyncEntity;

export function toTenant(dto: TenantDto): Tenant {
  return { id: dto.id, name: dto.name, createdAt: dto.createdAt };
}

export function toSyncRequest(dto: SyncRequestDto): SyncRequest {
  return {
    id: dto.id,
    tenantId: dto.tenantId,
    source: dto.source,
    target: dto.target,
    createdAt: dto.createdAt,
  };
}

export function toSyncEntity(dto: SyncEntityDto): SyncEntity {
  const metadata = {
    id: dto.id,
    syncRequestId: dto.syncRequestId,
    entity: dto.entity,
    status: dto.status,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
  return dto.syncType === 'interval'
    ? { ...metadata, syncType: dto.syncType, intervalSeconds: dto.intervalSeconds }
    : { ...metadata, syncType: dto.syncType, intervalSeconds: null };
}
