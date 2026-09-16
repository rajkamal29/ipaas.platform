import path from "node:path";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SyncEntityUseCase } from "../../src/application/use-cases/sync-entity.use-case";
import { SyncRequestUseCase } from "../../src/application/use-cases/sync-request.use-case";
import { TenantUseCase } from "../../src/application/use-cases/tenant.use-case";
import { createPool } from "../../src/infrastructure/postgres/pool";
import { PostgresSyncEntityRepository } from "../../src/infrastructure/postgres/sync-entity.repository";
import { PostgresSyncRequestRepository } from "../../src/infrastructure/postgres/sync-request.repository";
import { PostgresTenantRepository } from "../../src/infrastructure/postgres/tenant.repository";

const databaseUrl = process.env["TEST_DATABASE_URL"];
const schema = "ipaas_api_issue_11_test";
const suite = describe.skipIf(databaseUrl === undefined);

suite("PostgreSQL repositories against authoritative migrations", () => {
  let admin: Pool;
  let pool: Pool;
  let tenants: TenantUseCase;
  let requests: SyncRequestUseCase;
  let entities: SyncEntityUseCase;

  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl });
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    await runner({
      databaseUrl: databaseUrl!,
      dir: path.resolve(process.cwd(), "../ipaas.infra/migrations"),
      direction: "up",
      migrationsTable: "pgmigrations",
      schema,
      createSchema: false,
      count: Infinity,
      log: () => undefined,
    });
    const scopedUrl = new URL(databaseUrl!);
    scopedUrl.searchParams.set("options", `-csearch_path=${schema}`);
    pool = createPool(scopedUrl.toString());
    const tenantRepository = new PostgresTenantRepository(pool);
    const requestRepository = new PostgresSyncRequestRepository(pool);
    const entityRepository = new PostgresSyncEntityRepository(pool);
    tenants = new TenantUseCase(tenantRepository);
    requests = new SyncRequestUseCase(tenantRepository, requestRepository);
    entities = new SyncEntityUseCase(
      tenantRepository,
      requestRepository,
      entityRepository,
    );
  });

  afterAll(async () => {
    if (pool !== undefined) await pool.end();
    if (admin !== undefined) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  it("creates, reads, filters, and updates tenants with database defaults and uniqueness", async () => {
    const tenant = await tenants.create({
      body: { name: "  Integration tenant  " },
    });
    expect(tenant).toMatchObject({ name: "  Integration tenant  " });
    expect(Date.parse(tenant.createdAt)).not.toBeNaN();
    expect(await tenants.list({ name: "  Integration tenant  " })).toEqual([
      tenant,
    ]);
    expect(
      (await tenants.update(tenant.id, { body: { name: "Updated tenant" } }))
        .name,
    ).toBe("Updated tenant");
    await expect(
      tenants.create({ body: { name: "Updated tenant" } }),
    ).rejects.toMatchObject({
      code: "conflict",
    });
    expect((await tenants.get(tenant.id)).name).toBe("Updated tenant");
  });

  it("creates, reads, filters, and updates same-provider requests with ownership protection", async () => {
    const owner = await tenants.create({ body: { name: "Request owner" } });
    const other = await tenants.create({ body: { name: "Other owner" } });
    const syncRequest = await requests.create(owner.id, {
      body: { source: "keka", target: "keka" },
    });
    expect(syncRequest).toMatchObject({
      tenantId: owner.id,
      source: "keka",
      target: "keka",
    });
    expect(
      await requests.list(owner.id, { source: "keka", target: "keka" }),
    ).toEqual([syncRequest]);
    await expect(requests.get(other.id, syncRequest.id)).rejects.toMatchObject({
      code: "not-found",
    });
    expect(
      (
        await requests.update(owner.id, syncRequest.id, {
          body: { source: "connectwise", target: "keka" },
        })
      ).source,
    ).toBe("connectwise");
  });

  it("enforces entity ownership, uniqueness, interval constraints, timestamps, and updated_at", async () => {
    const owner = await tenants.create({ body: { name: "Entity owner" } });
    const other = await tenants.create({
      body: { name: "Wrong entity owner" },
    });
    const syncRequest = await requests.create(owner.id, {
      body: { source: "connectwise", target: "keka" },
    });
    const entity = await entities.create(owner.id, syncRequest.id, {
      body: {
        entity: "client",
        syncType: "interval",
        intervalSeconds: 60,
      },
    });
    expect(entity).toMatchObject({
      syncRequestId: syncRequest.id,
      status: "submitted",
      intervalSeconds: 60,
    });
    expect(await entities.list(owner.id, syncRequest.id)).toEqual([entity]);
    await expect(
      entities.get(other.id, syncRequest.id, entity.id),
    ).rejects.toMatchObject({ code: "not-found" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = await entities.update(owner.id, syncRequest.id, entity.id, {
      body: {
        entity: "client",
        syncType: "one_time",
        intervalSeconds: null,
        status: "completed",
      },
    });
    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(
      Date.parse(entity.updatedAt),
    );
    await expect(
      entities.create(owner.id, syncRequest.id, {
        body: {
          entity: "client",
          syncType: "one_time",
          intervalSeconds: null,
        },
      }),
    ).rejects.toMatchObject({
      code: "conflict",
    });
    expect(
      (await entities.get(owner.id, syncRequest.id, entity.id)).status,
    ).toBe("completed");
  });

  it("translates foreign-key failures and leaves prior records intact", async () => {
    const repository = new PostgresSyncRequestRepository(pool);
    await expect(
      repository.create("00000000-0000-4000-8000-999999999999", {
        source: "connectwise",
        target: "keka",
      }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(
      await pool.query("SELECT count(*)::integer AS count FROM sync_requests"),
    ).toMatchObject({ rows: [expect.objectContaining({ count: 2 })] });
  });
});
