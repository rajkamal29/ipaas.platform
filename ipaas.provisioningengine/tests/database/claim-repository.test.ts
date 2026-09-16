import assert from "node:assert/strict";
import { it } from "node:test";
import {
  PostgresSyncEntityClaimRepository,
  type ClaimConnection,
} from "../../src/infrastructure/persistence/postgres/repositories/postgres-sync-entity-claim-repository.js";
import { DependencyError } from "../../src/application/errors/provisioning-errors.js";
const id = "10000000-0000-4000-8000-000000000001";
function setup(failure?: "BEGIN" | "claim" | "COMMIT", rollbackFails = false) {
  const events: string[] = [];
  let destroyed: boolean | undefined;
  const client: ClaimConnection = {
    query: async (sql, values) => {
      const operation = sql.startsWith("WITH") ? "claim" : sql;
      events.push(operation);
      if (operation === "claim") {
        assert.match(sql, /WHERE status = 'submitted'/);
        assert.match(sql, /ORDER BY created_at, id/);
        assert.match(sql, /LIMIT \$1 FOR UPDATE SKIP LOCKED/);
        assert.match(sql, /SET status = 'provisioning', updated_at = now\(\)/);
        assert.deepEqual(values, [2]);
      }
      if (operation === failure || (rollbackFails && operation === "ROLLBACK"))
        throw new Error("secret connection string");
      return { rows: operation === "claim" ? [{ id }] : [], rowCount: 1 };
    },
    release: (destroy) => {
      destroyed = destroy;
      events.push("release");
    },
  };
  return {
    repo: new PostgresSyncEntityClaimRepository({
      connect: async () => client,
    }),
    events,
    destroyed: () => destroyed,
  };
}
it("claims with bounded parameterized locking SQL and commits before returning ids", async () => {
  const fake = setup();
  assert.deepEqual(await fake.repo.claimSubmitted(2), [id]);
  assert.deepEqual(fake.events, ["BEGIN", "claim", "COMMIT", "release"]);
});
for (const failure of ["BEGIN", "claim", "COMMIT"] as const) {
  it("rolls back and releases after " + failure + " failure", async () => {
    const fake = setup(failure);
    await assert.rejects(fake.repo.claimSubmitted(2), (error) => {
      assert.ok(error instanceof DependencyError);
      assert.equal(error.uncertain, failure === "COMMIT");
      assert.deepEqual(error.diagnostics, {
        dependency: "postgres",
        operation: "claim-submitted",
      });
      assert.ok(!JSON.stringify(error).includes("secret"));
      return true;
    });
    assert.deepEqual(fake.events.slice(-2), ["ROLLBACK", "release"]);
    assert.equal(fake.destroyed(), false);
  });
}
it("destroys a connection when rollback fails", async () => {
  const fake = setup("claim", true);
  await assert.rejects(fake.repo.claimSubmitted(2), DependencyError);
  assert.equal(fake.destroyed(), true);
});
it("wraps acquisition errors and rejects invalid limits before acquiring a client", async () => {
  let attempts = 0;
  const repo = new PostgresSyncEntityClaimRepository({
    connect: async () => {
      attempts++;
      throw new Error("secret");
    },
  });
  for (const limit of [0, -1, 101, 1.5, NaN])
    await assert.rejects(repo.claimSubmitted(limit), RangeError);
  assert.equal(attempts, 0);
  await assert.rejects(repo.claimSubmitted(1), DependencyError);
  assert.equal(attempts, 1);
});
