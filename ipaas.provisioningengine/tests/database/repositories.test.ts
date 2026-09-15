import assert from "node:assert/strict";
import { it } from "node:test";
import { PostgresSyncEntityRepository } from "../../src/infrastructure/persistence/postgres/repositories/postgres-sync-entity-repository.js";
import { PostgresSyncRequestRepository } from "../../src/infrastructure/persistence/postgres/repositories/postgres-sync-request-repository.js";
import { DependencyError } from "../../src/application/errors/provisioning-errors.js";
import { uuid } from "../../src/domain/value-objects/uuid.js";
import type { Queryable } from "../../src/infrastructure/persistence/postgres/query.js";
const id = uuid("10000000-0000-4000-8000-000000000001");
const time = new Date("2026-09-01T00:00:00Z");
const row = {
  id,
  sync_request_id: id,
  entity: "client",
  sync_type: "interval",
  status: "provisioning",
  interval_seconds: 60,
  created_at: time,
  updated_at: time,
};
it("maps database values and uses parameterized entity lookup", async () => {
  let sql = "";
  let values: unknown[] = [];
  const repo = new PostgresSyncEntityRepository({
    query: async (text, input) => {
      sql = text;
      values = input;
      return { rows: [row], rowCount: 1 };
    },
  });
  const entity = await repo.getById(id);
  assert.deepEqual(values, [id]);
  assert.match(sql, /WHERE id = \$1/);
  assert.equal(entity?.createdAt, time.toISOString());
  assert.equal(entity?.intervalSeconds, 60);
});
it("maps null cadence and missing records explicitly", async () => {
  const repo = new PostgresSyncEntityRepository({
    query: async () => ({
      rows: [{ ...row, sync_type: "one_time", interval_seconds: null }],
      rowCount: 1,
    }),
  });
  assert.equal((await repo.getById(id))?.intervalSeconds, null);
  const empty: Queryable = { query: async () => ({ rows: [], rowCount: 0 }) };
  assert.equal(await new PostgresSyncEntityRepository(empty).getById(id), null);
  assert.equal(
    await new PostgresSyncRequestRepository(empty).getById(id),
    null,
  );
});
it("maps parent provider metadata", async () => {
  const repo = new PostgresSyncRequestRepository({
    query: async (_sql, values) => {
      assert.deepEqual(values, [id]);
      return {
        rows: [
          {
            id,
            tenant_id: id,
            source: "keka",
            target: "keka",
            created_at: time,
          },
        ],
        rowCount: 1,
      };
    },
  });
  assert.equal((await repo.getById(id))?.target, "keka");
});
it("updates status conditionally and timestamps explicitly without overwriting concurrent status", async () => {
  let count = 1;
  const repo = new PostgresSyncEntityRepository({
    query: async (sql, values) => {
      assert.match(
        sql,
        /updated_at = now\(\).*WHERE id = \$1 AND status = \$2/,
      );
      assert.deepEqual(values, [id, "provisioning", "active"]);
      return { rows: [], rowCount: count };
    },
  });
  assert.equal(await repo.updateStatus(id, "provisioning", "active"), true);
  count = 0;
  assert.equal(await repo.updateStatus(id, "provisioning", "active"), false);
});
it("rejects malformed database rows and wraps driver failures", async () => {
  for (const invalid of [
    { ...row, status: "unknown" },
    { ...row, interval_seconds: null },
    { ...row, created_at: "invalid" },
  ]) {
    const repo = new PostgresSyncEntityRepository({
      query: async () => ({ rows: [invalid], rowCount: 1 }),
    });
    await assert.rejects(repo.getById(id), DependencyError);
  }
  const broken: Queryable = {
    query: async () => {
      throw new Error("secret driver payload");
    },
  };
  await assert.rejects(
    new PostgresSyncRequestRepository(broken).getById(id),
    (error) =>
      error instanceof DependencyError && !error.message.includes("secret"),
  );
});

it("preserves safe operation diagnostics for each repository failure", async () => {
  const database: Queryable = {
    query: async () => {
      throw new Error("secret connection string");
    },
  };
  const entities = new PostgresSyncEntityRepository(database);
  const requests = new PostgresSyncRequestRepository(database);
  for (const [operation, invoke] of [
    ["load-sync-entity", () => entities.getById(id)],
    ["load-sync-request", () => requests.getById(id)],
    [
      "update-status",
      () => entities.updateStatus(id, "provisioning", "failed"),
    ],
  ] as const) {
    await assert.rejects(invoke(), (error) => {
      assert.ok(error instanceof DependencyError);
      assert.deepEqual(error.diagnostics, {
        dependency: "postgres",
        operation,
      });
      assert.ok(!JSON.stringify(error).includes("secret"));
      return true;
    });
  }
});
