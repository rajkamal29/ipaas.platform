import { inject, Injectable } from '@angular/core';
import type { SyncState } from '../../../domain/models/sync-state';
import type { SyncStateRepository } from '../../contracts/sync-state.repository';
import { MockDataService } from '../mock-data.service';
import { assertId } from './mock-crud.repository';

@Injectable()
export class MockSyncStateRepository implements SyncStateRepository {
  private readonly data = inject(MockDataService);

  async getForEntity(syncEntityId: string): Promise<SyncState | null> {
    assertId(syncEntityId);
    return this.data.read('syncStates').find((row) => row.syncEntityId === syncEntityId) ?? null;
  }
}
