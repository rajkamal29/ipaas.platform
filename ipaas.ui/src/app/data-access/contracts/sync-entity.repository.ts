import type { SyncEntity, SyncSchedule } from '../../domain/models/sync-entity';
import type {
  EntityType,
  SyncEntityStatus,
  SyncType,
} from '../../domain/value-sets/database-values';
import type { CrudRepository } from './crud-repository';

export type CreateSyncEntity = SyncSchedule & {
  readonly tenantId?: string;
  readonly syncRequestId: string;
  readonly entity: EntityType;
  readonly status?: SyncEntityStatus;
};
export type UpdateSyncEntity = SyncSchedule & {
  readonly entity: EntityType;
  readonly status: SyncEntityStatus;
};
export interface SyncEntityFilter {
  readonly tenantId?: string;
  readonly syncRequestId?: string;
  readonly entity?: EntityType;
  readonly status?: SyncEntityStatus;
  readonly syncType?: SyncType;
}
export interface SyncEntityRouteContext {
  readonly tenantId: string;
  readonly syncRequestId: string;
}
export interface SyncEntityRepository extends CrudRepository<
  SyncEntity,
  CreateSyncEntity,
  UpdateSyncEntity,
  SyncEntityFilter
> {
  get(id: string, context?: SyncEntityRouteContext): Promise<SyncEntity | null>;
  update(
    id: string,
    input: UpdateSyncEntity,
    context?: SyncEntityRouteContext,
  ): Promise<SyncEntity>;
}
