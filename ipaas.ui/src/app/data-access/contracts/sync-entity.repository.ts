import type { SyncEntity, SyncSchedule } from '../../domain/models/sync-entity';
import type {
  EntityType,
  SyncEntityStatus,
  SyncType,
} from '../../domain/value-sets/database-values';
import type { CrudRepository } from './crud-repository';

export type CreateSyncEntity = SyncSchedule & {
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
export type SyncEntityRepository = CrudRepository<
  SyncEntity,
  CreateSyncEntity,
  UpdateSyncEntity,
  SyncEntityFilter
>;
