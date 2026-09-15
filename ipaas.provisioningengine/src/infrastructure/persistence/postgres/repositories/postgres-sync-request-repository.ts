import type { SyncRequestRepository } from "../../../../application/ports/repositories/sync-request-repository.js";
import { DependencyError } from "../../../../application/errors/provisioning-errors.js";
import type { SyncRequest } from "../../../../domain/entities/sync-request.js";
import type { Uuid } from "../../../../domain/value-objects/uuid.js";
import type { Queryable } from "../query.js";
import { mapSyncRequest } from "../row-mapping.js";
export class PostgresSyncRequestRepository implements SyncRequestRepository {
  constructor(private readonly database: Queryable) {}
  async getById(id: Uuid): Promise<SyncRequest | null> {
    try {
      const { rows } = await this.database.query(
        "SELECT id, tenant_id, source, target, created_at FROM public.sync_requests WHERE id = $1",
        [id],
      );
      return rows[0] ? mapSyncRequest(rows[0]) : null;
    } catch {
      throw new DependencyError("database", false, {
        dependency: "postgres",
        operation: "load-sync-request",
      });
    }
  }
}
