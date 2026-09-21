import type { SyncState } from "../../domain/sync-state/sync-state";

export interface SyncStateRepository {
  getBySyncEntityId(syncEntityId: string): Promise<SyncState | null>;
  getBySyncEntityIds(
    syncEntityIds: readonly string[],
  ): Promise<readonly SyncState[]>;
}
