import type { SyncEntityClaimRepository } from "../../../../application/ports/repositories/sync-entity-claim-repository.js";
import { DependencyError } from "../../../../application/errors/provisioning-errors.js";
import { uuid, type Uuid } from "../../../../domain/value-objects/uuid.js";
import { MAX_POLL_BATCH_SIZE } from "../../../../config/polling.js";
import type { Queryable } from "../query.js";

export interface ClaimConnection extends Queryable {
  release(destroy?: boolean): void;
}
export interface ClaimPool {
  connect(): Promise<ClaimConnection>;
}
export class PostgresSyncEntityClaimRepository implements SyncEntityClaimRepository {
  constructor(private readonly pool: ClaimPool) {}
  async claimSubmitted(limit: number): Promise<readonly Uuid[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_POLL_BATCH_SIZE)
      throw new RangeError("Invalid claim batch limit.");
    let client: ClaimConnection | undefined;
    let destroy = false;
    let committing = false;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN", []);
      const result = await client.query(
        `WITH candidates AS (
           SELECT id FROM public.sync_entities
           WHERE status = 'submitted'
           ORDER BY created_at, id
           LIMIT $1 FOR UPDATE SKIP LOCKED
         ), claimed AS (
           UPDATE public.sync_entities AS entity
           SET status = 'provisioning', updated_at = now()
           FROM candidates
           WHERE entity.id = candidates.id AND entity.status = 'submitted'
           RETURNING entity.id, entity.created_at
         )
         SELECT id FROM claimed ORDER BY created_at, id`,
        [limit],
      );
      const ids = result.rows.map((row) => {
        if (typeof row.id !== "string")
          throw new Error("Invalid claimed identity.");
        return uuid(row.id);
      });
      committing = true;
      await client.query("COMMIT", []);
      return ids;
    } catch {
      if (client) {
        try {
          await client.query("ROLLBACK", []);
        } catch {
          destroy = true;
        }
      }
      throw new DependencyError("database", committing, {
        dependency: "postgres",
        operation: "claim-submitted",
      });
    } finally {
      client?.release(destroy);
    }
  }
}
