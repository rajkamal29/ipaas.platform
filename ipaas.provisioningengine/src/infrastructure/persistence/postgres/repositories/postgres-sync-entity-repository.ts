import type { SyncEntityRepository } from "../../../../application/ports/repositories/sync-entity-repository.js";
import { DependencyError } from "../../../../application/errors/provisioning-errors.js";
import type { SyncEntity } from "../../../../domain/entities/sync-entity.js";
import type { SyncEntityStatus } from "../../../../domain/enums/platform-values.js";
import type { Uuid } from "../../../../domain/value-objects/uuid.js";
import type { Queryable } from "../query.js";
import { mapSyncEntity } from "../row-mapping.js";

export class PostgresSyncEntityRepository implements SyncEntityRepository {
  constructor(private readonly database: Queryable) {}
  async getById(id: Uuid): Promise<SyncEntity | null> {
    try {
      const { rows } = await this.database.query(
        "SELECT id, sync_request_id, entity, sync_type, status, interval_seconds, created_at, updated_at FROM public.sync_entities WHERE id = $1",
        [id],
      );
      return rows[0] ? mapSyncEntity(rows[0]) : null;
    } catch {
      throw new DependencyError("database", false, {
        dependency: "postgres",
        operation: "load-sync-entity",
      });
    }
  }
  async updateStatus(
    id: Uuid,
    expected: SyncEntityStatus,
    next: SyncEntityStatus,
  ): Promise<boolean> {
    try {
      const result = await this.database.query(
        "UPDATE public.sync_entities SET status = $3, updated_at = now() WHERE id = $1 AND status = $2",
        [id, expected, next],
      );
      return result.rowCount === 1;
    } catch {
      throw new DependencyError("database", false, {
        dependency: "postgres",
        operation: "update-status",
      });
    }
  }
}
