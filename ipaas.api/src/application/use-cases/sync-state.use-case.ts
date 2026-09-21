import type { SyncStateRepository } from "../ports/sync-state.repository";

export class SyncStateUseCase {
  constructor(private readonly states: SyncStateRepository) {}

  getBySyncEntityId(syncEntityId: string) {
    return this.states.getBySyncEntityId(syncEntityId);
  }

  getBySyncEntityIds(syncEntityIds: readonly string[]) {
    return this.states.getBySyncEntityIds(syncEntityIds);
  }
}
