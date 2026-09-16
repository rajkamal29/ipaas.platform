import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { createDatabasePool } from "../../src/infrastructure/persistence/postgres/postgres-client.js";
import {
  PostgresSyncEntityClaimRepository,
  type ClaimPool,
} from "../../src/infrastructure/persistence/postgres/repositories/postgres-sync-entity-claim-repository.js";
import { loadDatabaseConfig } from "../../src/config/environment.js";
import { DependencyError } from "../../src/application/errors/provisioning-errors.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Opt-in only: shared local infra database, existing schema, disposable tenant fixtures.
it(
  "real PostgreSQL claims disjoint ordered batches, skips locked rows, and rolls back failures",
  {
    skip: process.env.RUN_LIVE_VERIFICATION !== "true",
    timeout: 15000,
  },
  async () => {
    const pool = createDatabasePool(loadDatabaseConfig().databaseUrl);
    const tenantId = randomUUID();
    const fixtureIds: string[] = Array.from({ length: 10 }, () =>
      randomUUID(),
    ).sort();
    const statuses = [
      "submitted",
      "submitted",
      "submitted",
      "submitted",
      "submitted",
      "submitted",
      "provisioning",
      "active",
      "completed",
      "failed",
    ];
    const allowCommit = deferred();
    const firstLocked = deferred();
    const operations: Promise<unknown>[] = [];
    const guard = await pool.connect();
    function claimPool(beforeCommit?: () => Promise<void>): ClaimPool {
      return {
        connect: async () => {
          const client = await pool.connect();
          let selected: string[] = [];
          return {
            query: async (sql, values) => {
              if (sql === "COMMIT") {
                // Abort rather than commit any unrelated row, even if new work appears during the test.
                assert.ok(
                  selected.every((id) => fixtureIds.includes(id)),
                  "Integration test refuses unrelated claims",
                );
                if (beforeCommit) await beforeCommit();
              }
              const result = await client.query(sql, values);
              if (sql.startsWith("WITH"))
                selected = result.rows.map((row) => String(row.id));
              return result;
            },
            release: (destroy) => client.release(destroy),
          };
        },
      };
    }
    try {
      await guard.query("BEGIN");
      await guard.query("SET LOCAL lock_timeout = '1s'");
      // Protect existing submitted work from the real, unmodified claiming query.
      await guard.query(
        "SELECT id FROM public.sync_entities WHERE status = 'submitted' FOR UPDATE",
      );
      await pool.query(
        "INSERT INTO public.tenants (id, name) VALUES ($1, $2)",
        [tenantId, "claim-test-" + tenantId],
      );
      for (let index = 0; index < fixtureIds.length; index++) {
        const requestId = randomUUID();
        await pool.query(
          "INSERT INTO public.sync_requests (id, tenant_id, source, target) VALUES ($1, $2, 'connectwise', 'keka')",
          [requestId, tenantId],
        );
        const syncType =
          index === 1 ? "interval" : index === 2 ? "real_time" : "one_time";
        await pool.query(
          "INSERT INTO public.sync_entities (id, sync_request_id, entity, sync_type, status, interval_seconds, created_at, updated_at) VALUES ($1, $2, 'client', $3, $4, $5, $6, $6)",
          [
            fixtureIds[index],
            requestId,
            syncType,
            statuses[index],
            syncType === "interval" ? 60 : null,
            index < 3 ? "2000-01-01T00:00:00Z" : "2000-01-02T00:00:00Z",
          ],
        );
      }
      const first = new PostgresSyncEntityClaimRepository(
        claimPool(async () => {
          firstLocked.resolve();
          await allowCommit.promise;
        }),
      );
      const second = new PostgresSyncEntityClaimRepository(claimPool());
      const aPromise = first.claimSubmitted(2);
      operations.push(aPromise);
      await Promise.race([
        firstLocked.promise,
        aPromise.then(() => {
          throw new Error("Claim completed before lock checkpoint");
        }),
      ]);
      // A still holds its row locks; B must complete without waiting for A's COMMIT.
      const b = await second.claimSubmitted(2);
      assert.deepEqual(b, fixtureIds.slice(2, 4));
      allowCommit.resolve();
      const a = await aPromise;
      assert.deepEqual(a, fixtureIds.slice(0, 2));
      assert.equal(a.filter((id) => b.includes(id)).length, 0);
      assert.deepEqual(await second.claimSubmitted(2), fixtureIds.slice(4, 6));
      assert.deepEqual(await second.claimSubmitted(2), []);
      const actual = await pool.query(
        "SELECT id, status, updated_at > created_at AS touched FROM public.sync_entities WHERE id = ANY($1::uuid[]) ORDER BY id",
        [fixtureIds],
      );
      assert.deepEqual(
        actual.rows.map((row) => row.status),
        [...Array(6).fill("provisioning"), ...statuses.slice(6)],
      );
      assert.ok(actual.rows.slice(0, 6).every((row) => row.touched));
      // Failure after UPDATE but before COMMIT must restore the submitted row.
      await pool.query(
        "UPDATE public.sync_entities SET status = 'submitted' WHERE id = $1",
        [fixtureIds[0]],
      );
      const rollback = new PostgresSyncEntityClaimRepository(
        claimPool(async () => {
          throw new Error("injected commit failure");
        }),
      );
      await assert.rejects(rollback.claimSubmitted(1), DependencyError);
      const restored = await pool.query(
        "SELECT status FROM public.sync_entities WHERE id = $1",
        [fixtureIds[0]],
      );
      assert.equal(restored.rows[0]?.status, "submitted");
    } finally {
      allowCommit.resolve();
      await Promise.allSettled(operations);
      try {
        await guard.query("ROLLBACK");
        await pool.query("DELETE FROM public.tenants WHERE id = $1", [
          tenantId,
        ]);
      } finally {
        guard.release();
        await pool.end();
      }
    }
  },
);
