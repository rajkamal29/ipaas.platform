import type { Pool } from "pg";
import type {
  SyncRequestListFilter,
  SyncRequestWriteInput,
} from "../../application/contracts/sync-request.contracts";
import type { SyncRequestRepository } from "../../application/ports/sync-request.repository";
import {
  mapSyncRequest,
  type SyncRequestRow,
} from "./mappers/sync-request.mapper";
import { withPostgresErrors } from "./postgres-error";
import { requiredRow } from "./required-row";

export class PostgresSyncRequestRepository implements SyncRequestRepository {
  constructor(private readonly pool: Pool) {}

  async list(tenantId: string, filter: SyncRequestListFilter) {
    const values: unknown[] = [tenantId];
    const clauses = ["tenant_id = $1"];
    if (filter.source !== undefined) {
      values.push(filter.source);
      clauses.push("source = $" + String(values.length));
    }
    if (filter.target !== undefined) {
      values.push(filter.target);
      clauses.push("target = $" + String(values.length));
    }
    const result = await this.pool.query<SyncRequestRow>(
      `SELECT id, tenant_id, source, target, created_at FROM sync_requests WHERE ${clauses.join(" AND ")}`,
      values,
    );
    return result.rows.map(mapSyncRequest);
  }

  async get(id: string) {
    const result = await this.pool.query<SyncRequestRow>(
      "SELECT id, tenant_id, source, target, created_at FROM sync_requests WHERE id = $1",
      [id],
    );
    return result.rows[0] === undefined ? null : mapSyncRequest(result.rows[0]);
  }

  create(tenantId: string, input: SyncRequestWriteInput) {
    return withPostgresErrors(async () => {
      const result = await this.pool.query<SyncRequestRow>(
        `INSERT INTO sync_requests (tenant_id, source, target)
         VALUES ($1, $2, $3) RETURNING id, tenant_id, source, target, created_at`,
        [tenantId, input.source, input.target],
      );
      return mapSyncRequest(requiredRow(result.rows));
    });
  }

  update(id: string, input: SyncRequestWriteInput) {
    return withPostgresErrors(async () => {
      const result = await this.pool.query<SyncRequestRow>(
        `UPDATE sync_requests SET source = $2, target = $3 WHERE id = $1
         RETURNING id, tenant_id, source, target, created_at`,
        [id, input.source, input.target],
      );
      return result.rows[0] === undefined
        ? null
        : mapSyncRequest(result.rows[0]);
    });
  }
}
