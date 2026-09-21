import { Injectable } from '@angular/core';
import type { SyncEntity, SyncEntityRead, SyncSchedule } from '../../../domain/models/sync-entity';
import { SYNC_ENTITY_STATUSES, SYNC_TYPES } from '../../../domain/value-sets/database-values';
import type {
  CreateSyncEntity,
  SyncEntityFilter,
  SyncEntityRepository,
  UpdateSyncEntity,
} from '../../contracts/sync-entity.repository';
import type { MockDatabase } from '../mock-database';
import { MockCrudRepository } from './mock-crud.repository';

function schedule(input: SyncSchedule): SyncSchedule {
  return input.syncType === SYNC_TYPES.interval
    ? { syncType: SYNC_TYPES.interval, intervalSeconds: input.intervalSeconds }
    : { syncType: input.syncType, intervalSeconds: input.intervalSeconds };
}

@Injectable()
export class MockSyncEntityRepository
  extends MockCrudRepository<'syncEntities', CreateSyncEntity, UpdateSyncEntity, SyncEntityFilter>
  implements SyncEntityRepository
{
  constructor() {
    super('syncEntities');
  }

  override async list(filter?: SyncEntityFilter): Promise<readonly SyncEntityRead[]> {
    return (await super.list(filter)).map((row) => this.toReadModel(row));
  }

  override async get(id: string): Promise<SyncEntityRead | null> {
    const row = await super.get(id);
    return row === null ? null : this.toReadModel(row);
  }

  protected override build(input: CreateSyncEntity, id: string, now: string): SyncEntity {
    return {
      id,
      syncRequestId: input.syncRequestId,
      entity: input.entity,
      ...schedule(input),
      status: input.status === undefined ? SYNC_ENTITY_STATUSES.submitted : input.status,
      createdAt: now,
      updatedAt: now,
    };
  }
  protected override replace(row: SyncEntity, input: UpdateSyncEntity, now: string): SyncEntity {
    return {
      ...row,
      entity: input.entity,
      status: input.status,
      ...schedule(input),
      updatedAt: now,
    };
  }
  protected override matches(
    row: SyncEntity,
    filter: SyncEntityFilter,
    database: MockDatabase,
  ): boolean {
    return (
      (filter.syncRequestId === undefined || row.syncRequestId === filter.syncRequestId) &&
      (filter.tenantId === undefined ||
        database.syncRequests.some(
          (request) => request.id === row.syncRequestId && request.tenantId === filter.tenantId,
        )) &&
      (filter.entity === undefined || row.entity === filter.entity) &&
      (filter.status === undefined || row.status === filter.status) &&
      (filter.syncType === undefined || row.syncType === filter.syncType)
    );
  }

  private toReadModel(row: SyncEntity): SyncEntityRead {
    const state = this.data
      .snapshot()
      .syncStates.find((candidate) => candidate.syncEntityId === row.id);
    return {
      ...row,
      lastRunStatus: state?.lastRunStatus ?? null,
      syncStateUpdatedAt: state?.updatedAt ?? null,
      failedCount: Array.isArray(state?.failed) ? state.failed.length : 0,
      retryCount: Array.isArray(state?.retry) ? state.retry.length : 0,
    };
  }
}
