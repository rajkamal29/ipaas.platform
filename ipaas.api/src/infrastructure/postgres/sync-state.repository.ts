import type { Pool } from "pg";
import type { SyncStateRepository } from "../../application/ports/sync-state.repository";
import { mapSyncState, type SyncStateRow } from "./mappers/sync-state.mapper";

const columns = "sync_entity_id, last_run_status, updated_at, failed, retry";

export class PostgresSyncStateRepository implements SyncStateRepository {
  constructor(private readonly pool: Pool) {}

  async getBySyncEntityId(syncEntityId: string) {
    const result = await this.pool.query<SyncStateRow>(
      `SELECT ${columns} FROM sync_state WHERE sync_entity_id = $1`,
      [syncEntityId],
    );
    return result.rows[0] === undefined ? null : mapSyncState(result.rows[0]);
  }

  async getBySyncEntityIds(syncEntityIds: readonly string[]) {
    if (syncEntityIds.length === 0) return [];
    const result = await this.pool.query<SyncStateRow>(
      `SELECT ${columns} FROM sync_state WHERE sync_entity_id = ANY($1::uuid[])`,
      [syncEntityIds],
    );
    return result.rows.map(mapSyncState);
  }
}
