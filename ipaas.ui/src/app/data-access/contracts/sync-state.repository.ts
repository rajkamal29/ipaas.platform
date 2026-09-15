import type { SyncState } from '../../domain/models/sync-state';

/** Engine-owned latest state, not an editable UI resource or run-history collection. */
export interface SyncStateRepository {
  getForEntity(syncEntityId: string): Promise<SyncState | null>;
}
