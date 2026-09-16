import type { Pool } from "pg";
import type {
  CreateSyncEntityInput,
  UpdateSyncEntityInput,
} from "../../application/contracts/sync-entity.contracts";
import type { SyncEntityRepository } from "../../application/ports/sync-entity.repository";
import {
  mapSyncEntity,
  type SyncEntityRow,
} from "./mappers/sync-entity.mapper";
import { withPostgresErrors } from "./postgres-error";
import { requiredRow } from "./required-row";

const columns =
  "id, sync_request_id, entity, sync_type, status, interval_seconds, created_at, updated_at";

export class PostgresSyncEntityRepository implements SyncEntityRepository {
  constructor(private readonly pool: Pool) {}

  async list(syncRequestId: string) {
    const result = await this.pool.query<SyncEntityRow>(
      `SELECT ${columns} FROM sync_entities WHERE sync_request_id = $1`,
      [syncRequestId],
    );
    return result.rows.map(mapSyncEntity);
  }

  async get(id: string) {
    const result = await this.pool.query<SyncEntityRow>(
      `SELECT ${columns} FROM sync_entities WHERE id = $1`,
      [id],
    );
    return result.rows[0] === undefined ? null : mapSyncEntity(result.rows[0]);
  }

  create(syncRequestId: string, input: CreateSyncEntityInput) {
    return withPostgresErrors(async () => {
      const result = await this.pool.query<SyncEntityRow>(
        `INSERT INTO sync_entities (sync_request_id, entity, sync_type, interval_seconds, status)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${columns}`,
        [
          syncRequestId,
          input.entity,
          input.syncType,
          input.intervalSeconds,
          input.status ?? "submitted",
        ],
      );
      return mapSyncEntity(requiredRow(result.rows));
    });
  }

  update(id: string, input: UpdateSyncEntityInput) {
    return withPostgresErrors(async () => {
      const result = await this.pool.query<SyncEntityRow>(
        `UPDATE sync_entities
         SET entity = $2, sync_type = $3, interval_seconds = $4, status = $5, updated_at = now()
         WHERE id = $1 RETURNING ${columns}`,
        [id, input.entity, input.syncType, input.intervalSeconds, input.status],
      );
      return result.rows[0] === undefined
        ? null
        : mapSyncEntity(result.rows[0]);
    });
  }
}
