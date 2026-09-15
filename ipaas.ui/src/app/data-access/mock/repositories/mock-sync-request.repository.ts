import { Injectable } from '@angular/core';
import type { SyncRequest } from '../../../domain/models/sync-request';
import type {
  CreateSyncRequest,
  SyncRequestFilter,
  SyncRequestInput,
  SyncRequestRepository,
} from '../../contracts/sync-request.repository';
import { MockCrudRepository } from './mock-crud.repository';

@Injectable()
export class MockSyncRequestRepository
  extends MockCrudRepository<'syncRequests', CreateSyncRequest, SyncRequestInput, SyncRequestFilter>
  implements SyncRequestRepository
{
  constructor() {
    super('syncRequests');
  }

  protected override build(input: CreateSyncRequest, id: string, now: string): SyncRequest {
    return {
      id,
      tenantId: input.tenantId,
      source: input.source,
      target: input.target,
      createdAt: now,
    };
  }
  protected override replace(row: SyncRequest, input: SyncRequestInput): SyncRequest {
    return { ...row, source: input.source, target: input.target };
  }
  protected override matches(row: SyncRequest, filter: SyncRequestFilter): boolean {
    return (
      (filter.tenantId === undefined || row.tenantId === filter.tenantId) &&
      (filter.source === undefined || row.source === filter.source) &&
      (filter.target === undefined || row.target === filter.target)
    );
  }
}
