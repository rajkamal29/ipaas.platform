import request, { type Response } from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import type {
  CreateSyncEntityInput,
  UpdateSyncEntityInput,
} from "../../src/application/contracts/sync-entity.contracts";
import type {
  SyncRequestListFilter,
  SyncRequestWriteInput,
} from "../../src/application/contracts/sync-request.contracts";
import type {
  TenantListFilter,
  TenantWriteInput,
} from "../../src/application/contracts/tenant.contracts";
import { ConflictError } from "../../src/application/errors/conflict-error";
import type { SyncEntityRepository } from "../../src/application/ports/sync-entity.repository";
import type { SyncRequestRepository } from "../../src/application/ports/sync-request.repository";
import type { TenantRepository } from "../../src/application/ports/tenant.repository";
import { SyncEntityUseCase } from "../../src/application/use-cases/sync-entity.use-case";
import { SyncRequestUseCase } from "../../src/application/use-cases/sync-request.use-case";
import { TenantUseCase } from "../../src/application/use-cases/tenant.use-case";
import type { SyncEntity } from "../../src/domain/sync-entity/sync-entity";
import type { SyncRequest } from "../../src/domain/sync-request/sync-request";
import type { Tenant } from "../../src/domain/tenant/tenant";

const ids = {
  tenantA: "00000000-0000-4000-8000-000000000001",
  tenantB: "00000000-0000-4000-8000-000000000002",
  requestA: "00000000-0000-4000-8000-000000000011",
  requestB: "00000000-0000-4000-8000-000000000012",
  entityA: "00000000-0000-4000-8000-000000000021",
};
const now = "2026-09-15T00:00:00.000Z";

function expectSuccessEnvelope(response: Response): void {
  expect(response.body).toEqual({
    data: expect.anything(),
    timestamp: expect.any(String),
  });
  const timestamp: unknown = response.body.timestamp;
  if (typeof timestamp !== "string") throw new Error("Missing timestamp.");
  expect(new Date(timestamp).toISOString()).toBe(timestamp);
  expect(response.body).not.toHaveProperty("success");
  expect(response.body).not.toHaveProperty("requestId");
  expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
}

class MemoryTenants implements TenantRepository {
  rows: Tenant[] = [
    { id: ids.tenantA, name: "A", createdAt: now },
    { id: ids.tenantB, name: "B", createdAt: now },
  ];
  async list(filter: TenantListFilter) {
    return this.rows.filter(
      (row) => filter.name === undefined || row.name === filter.name,
    );
  }
  async get(id: string) {
    return this.rows.find((row) => row.id === id) ?? null;
  }
  async create(input: TenantWriteInput) {
    if (this.rows.some((row) => row.name === input.name))
      throw new ConflictError("A tenant with this exact name already exists.");
    const row = { id: crypto.randomUUID(), ...input, createdAt: now };
    this.rows.push(row);
    return row;
  }
  async update(id: string, input: TenantWriteInput) {
    const index = this.rows.findIndex((row) => row.id === id);
    if (index < 0) return null;
    const row = { ...this.rows[index]!, ...input };
    this.rows[index] = row;
    return row;
  }
}

class MemoryRequests implements SyncRequestRepository {
  rows: SyncRequest[] = [
    {
      id: ids.requestA,
      tenantId: ids.tenantA,
      source: "connectwise",
      target: "keka",
      createdAt: now,
    },
    {
      id: ids.requestB,
      tenantId: ids.tenantA,
      source: "connectwise",
      target: "connectwise",
      createdAt: now,
    },
  ];
  async list(tenantId: string, filter: SyncRequestListFilter) {
    return this.rows.filter(
      (row) =>
        row.tenantId === tenantId &&
        (filter.source === undefined || row.source === filter.source) &&
        (filter.target === undefined || row.target === filter.target),
    );
  }
  async get(id: string) {
    return this.rows.find((row) => row.id === id) ?? null;
  }
  async create(tenantId: string, input: SyncRequestWriteInput) {
    const row = { id: crypto.randomUUID(), tenantId, ...input, createdAt: now };
    this.rows.push(row);
    return row;
  }
  async update(id: string, input: SyncRequestWriteInput) {
    const index = this.rows.findIndex((row) => row.id === id);
    if (index < 0) return null;
    const row = { ...this.rows[index]!, ...input };
    this.rows[index] = row;
    return row;
  }
}

class MemoryEntities implements SyncEntityRepository {
  rows: SyncEntity[] = [
    {
      id: ids.entityA,
      syncRequestId: ids.requestA,
      entity: "client",
      syncType: "interval",
      intervalSeconds: 60,
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
  ];
  async list(syncRequestId: string) {
    return this.rows.filter((row) => row.syncRequestId === syncRequestId);
  }
  async get(id: string) {
    return this.rows.find((row) => row.id === id) ?? null;
  }
  async create(syncRequestId: string, input: CreateSyncEntityInput) {
    if (
      this.rows.some(
        (row) =>
          row.syncRequestId === syncRequestId && row.entity === input.entity,
      )
    )
      throw new ConflictError(
        "This entity is already configured for the sync request.",
      );
    const row = {
      id: crypto.randomUUID(),
      syncRequestId,
      ...input,
      status: input.status ?? "submitted",
      createdAt: now,
      updatedAt: now,
    } as SyncEntity;
    this.rows.push(row);
    return row;
  }
  async update(id: string, input: UpdateSyncEntityInput) {
    const index = this.rows.findIndex((row) => row.id === id);
    if (index < 0) return null;
    const row = {
      ...this.rows[index]!,
      ...input,
      updatedAt: new Date(Date.parse(now) + 1000).toISOString(),
    } as SyncEntity;
    this.rows[index] = row;
    return row;
  }
}

function testApp(options?: {
  readonly checkReadiness?: () => Promise<void>;
  readonly tenantListError?: Error;
}) {
  const tenants = new MemoryTenants();
  if (options?.tenantListError !== undefined) {
    const tenantListError = options.tenantListError;
    tenants.list = async () => {
      throw tenantListError;
    };
  }
  const requests = new MemoryRequests();
  const entities = new MemoryEntities();
  return createApp({
    tenants: new TenantUseCase(tenants),
    syncRequests: new SyncRequestUseCase(tenants, requests),
    syncEntities: new SyncEntityUseCase(tenants, requests, entities),
    checkReadiness: options?.checkReadiness ?? (async () => undefined),
    logger: { info: () => undefined, error: () => undefined },
  });
}

describe("Issue #11 HTTP contract", () => {
  let app: ReturnType<typeof testApp>;
  beforeEach(() => {
    app = testApp();
  });

  it("serves health/readiness and request IDs", async () => {
    const response = await request(app).get("/health").expect(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    await request(app).get("/ready").expect(200, { status: "ready" });
  });

  it("returns the current safe readiness failure contract", async () => {
    const databaseFailure = new Error(
      "postgres connection secret=do-not-expose DATABASE_URL=/private/path",
    );
    const unavailableApp = testApp({
      checkReadiness: async () => {
        throw databaseFailure;
      },
    });
    const response = await request(unavailableApp).get("/ready").expect(503);
    expect(response.body).toEqual({ status: "unavailable" });
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(response.body)).not.toMatch(
      /postgres|secret|database_url|private|stack/i,
    );
  });

  it("implements tenant list, filter, create, get, replace, and conflict responses", async () => {
    const listed = await request(app).get("/api/tenants?name=A").expect(200);
    expectSuccessEnvelope(listed);
    expect(listed.body.data).toHaveLength(1);
    const created = await request(app)
      .post("/api/tenants")
      .send({ name: "  C  " })
      .expect(201);
    expectSuccessEnvelope(created);
    expect(created.body.data).toEqual({
      id: expect.any(String),
      name: "  C  ",
      createdAt: now,
    });
    const fetched = await request(app)
      .get(`/api/tenants/${created.body.data.id}`)
      .expect(200);
    expectSuccessEnvelope(fetched);
    expect(fetched.body.data).toEqual({
      id: created.body.data.id,
      name: "  C  ",
      createdAt: now,
    });
    const updated = await request(app)
      .put(`/api/tenants/${created.body.data.id}`)
      .send({ name: "Changed" })
      .expect(200);
    expectSuccessEnvelope(updated);
    const conflict = await request(app)
      .post("/api/tenants")
      .send({ name: "A" })
      .expect(409);
    expect(conflict.body.error).toMatchObject({
      code: "conflict",
      message: "A tenant with this exact name already exists.",
    });
    expect(conflict.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(conflict.body.error).not.toHaveProperty("constraint");
    expect(JSON.stringify(conflict.body)).not.toMatch(
      /tenants_name_key|postgres|secret sql detail|stack/i,
    );
  });

  it("implements nested request CRUD without rejecting equal providers", async () => {
    const created = await request(app)
      .post(`/api/tenants/${ids.tenantA}/sync-requests`)
      .send({ source: "keka", target: "keka" })
      .expect(201);
    expectSuccessEnvelope(created);
    expect(created.body.data).toEqual({
      id: expect.any(String),
      tenantId: ids.tenantA,
      source: "keka",
      target: "keka",
      createdAt: now,
    });
    const listed = await request(app)
      .get(`/api/tenants/${ids.tenantA}/sync-requests?source=keka&target=keka`)
      .expect(200);
    expectSuccessEnvelope(listed);
    expect(listed.body.data).toHaveLength(1);
    const fetched = await request(app)
      .get(`/api/tenants/${ids.tenantA}/sync-requests/${created.body.data.id}`)
      .expect(200);
    expectSuccessEnvelope(fetched);
    expect(fetched.body.data).toEqual({
      id: created.body.data.id,
      tenantId: ids.tenantA,
      source: "keka",
      target: "keka",
      createdAt: now,
    });
    const updated = await request(app)
      .put(`/api/tenants/${ids.tenantA}/sync-requests/${created.body.data.id}`)
      .send({ source: "connectwise", target: "keka" })
      .expect(200);
    expectSuccessEnvelope(updated);
  });

  it("implements entity CRUD, parent-scoped listing, camelCase, defaults, and full PUT", async () => {
    const created = await request(app)
      .post(
        `/api/tenants/${ids.tenantA}/sync-requests/${ids.requestA}/entities`,
      )
      .send({ entity: "project", syncType: "one_time" })
      .expect(201);
    expectSuccessEnvelope(created);
    expect(created.body.data).toMatchObject({
      syncRequestId: ids.requestA,
      intervalSeconds: null,
      status: "submitted",
    });
    expect(created.body.data).not.toHaveProperty("sync_request_id");
    const listed = await request(app)
      .get(`/api/tenants/${ids.tenantA}/sync-requests/${ids.requestA}/entities`)
      .expect(200);
    expectSuccessEnvelope(listed);
    expect(listed.body.data).toHaveLength(2);
    const fetched = await request(app)
      .get(
        `/api/tenants/${ids.tenantA}/sync-requests/${ids.requestA}/entities/${created.body.data.id}`,
      )
      .expect(200);
    expectSuccessEnvelope(fetched);
    expect(fetched.body.data).toEqual({
      id: created.body.data.id,
      syncRequestId: ids.requestA,
      entity: "project",
      syncType: "one_time",
      status: "submitted",
      createdAt: now,
      updatedAt: now,
      intervalSeconds: null,
    });
    const updated = await request(app)
      .put(
        `/api/tenants/${ids.tenantA}/sync-requests/${ids.requestA}/entities/${created.body.data.id}`,
      )
      .send({
        entity: "project",
        syncType: "interval",
        intervalSeconds: 60,
        status: "active",
      })
      .expect(200);
    expectSuccessEnvelope(updated);
    await request(app)
      .put(
        `/api/tenants/${ids.tenantA}/sync-requests/${ids.requestA}/entities/${created.body.data.id}`,
      )
      .send({ status: "active" })
      .expect(422);
  });

  it("returns safe validation, malformed JSON, not-found, ownership, and unknown-route errors", async () => {
    const invalid = await request(app)
      .post(
        `/api/tenants/${ids.tenantA}/sync-requests/${ids.requestA}/entities`,
      )
      .send({ entity: "client", syncType: "interval", intervalSeconds: 59 })
      .expect(422);
    expect(invalid.body.error).toMatchObject({ code: "validation" });
    expect(invalid.body.error.requestId).toBeTruthy();
    await request(app)
      .post("/api/tenants")
      .set("content-type", "application/json")
      .send("{")
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe("malformed-json"));
    await request(app)
      .get(`/api/tenants/${ids.tenantB}/sync-requests/${ids.requestA}`)
      .expect(404)
      .expect(({ body }) => expect(body.error.code).toBe("not-found"));
    await request(app).get("/does-not-exist").expect(404);
  });

  it.each([
    ["tenantId", "/api/tenants/not-a-uuid"],
    ["requestId", `/api/tenants/${ids.tenantA}/sync-requests/not-a-uuid`],
    [
      "entityId",
      `/api/tenants/${ids.tenantA}/sync-requests/${ids.requestA}/entities/not-a-uuid`,
    ],
  ])(
    "rejects a malformed %s without database detail leakage",
    async (_field, url) => {
      const response = await request(app).get(url).expect(422);
      expect(response.body.error).toMatchObject({ code: "validation" });
      expect(response.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(JSON.stringify(response.body)).not.toMatch(
        /postgres|constraint|select |insert |update |stack/i,
      );
    },
  );

  it.each([
    ["duplicate source", "source=keka&source=connectwise"],
    ["duplicate target", "target=keka&target=connectwise"],
    ["invalid source", "source=unsupported"],
    ["invalid target", "target=unsupported"],
    ["empty source", "source="],
    ["empty target", "target="],
    ["malformed encoded source", "source=%E0%A4%A"],
  ])("rejects %s query values", async (_case, query) => {
    const response = await request(app)
      .get(`/api/tenants/${ids.tenantA}/sync-requests?${query}`)
      .expect(422);
    expect(response.body.error).toMatchObject({ code: "validation" });
  });

  const bodyContracts = [
    {
      name: "tenant POST",
      method: "post" as const,
      url: "/api/tenants",
      missingRequired: {},
      incorrectType: { name: 42 },
      immutable: { name: "C", id: ids.tenantA },
      validWithExtra: { name: "C", extra: true },
    },
    {
      name: "tenant PUT",
      method: "put" as const,
      url: `/api/tenants/${ids.tenantA}`,
      missingRequired: {},
      incorrectType: { name: false },
      immutable: { name: "A", createdAt: now },
      validWithExtra: { name: "A", extra: true },
    },
    {
      name: "sync request POST",
      method: "post" as const,
      url: `/api/tenants/${ids.tenantA}/sync-requests`,
      missingRequired: { source: "keka" },
      incorrectType: { source: 1, target: "keka" },
      immutable: { source: "keka", target: "keka", tenantId: ids.tenantA },
      validWithExtra: { source: "keka", target: "keka", extra: true },
    },
    {
      name: "sync request PUT",
      method: "put" as const,
      url: `/api/tenants/${ids.tenantA}/sync-requests/${ids.requestA}`,
      missingRequired: { source: "keka" },
      incorrectType: { source: "keka", target: false },
      immutable: { source: "keka", target: "keka", id: ids.requestA },
      validWithExtra: { source: "keka", target: "keka", extra: true },
    },
    {
      name: "sync entity POST",
      method: "post" as const,
      url: `/api/tenants/${ids.tenantA}/sync-requests/${ids.requestA}/entities`,
      missingRequired: { entity: "project" },
      incorrectType: { entity: 1, syncType: "one_time" },
      immutable: {
        entity: "project",
        syncType: "one_time",
        syncRequestId: ids.requestA,
      },
      validWithExtra: {
        entity: "project",
        syncType: "one_time",
        extra: true,
      },
    },
    {
      name: "sync entity PUT",
      method: "put" as const,
      url: `/api/tenants/${ids.tenantA}/sync-requests/${ids.requestA}/entities/${ids.entityA}`,
      missingRequired: { entity: "client", syncType: "one_time" },
      incorrectType: {
        entity: "client",
        syncType: "one_time",
        status: 1,
      },
      immutable: {
        entity: "client",
        syncType: "one_time",
        status: "active",
        createdAt: now,
      },
      validWithExtra: {
        entity: "client",
        syncType: "one_time",
        status: "active",
        extra: true,
      },
    },
  ];

  it.each(bodyContracts)(
    "rejects malformed $name body shapes and fields",
    async ({
      method,
      url,
      missingRequired,
      incorrectType,
      immutable,
      validWithExtra,
    }) => {
      const send = (body?: unknown) => {
        const agent = request(app);
        const pending = agent[method](url).set(
          "content-type",
          "application/json",
        );
        return body === undefined
          ? pending
          : pending.send(body as string | object);
      };
      await send().expect(422);
      await send("null").expect(400);
      await send([]).expect(422);
      await send("true").expect(400);
      await send(missingRequired).expect(422);
      await send(incorrectType).expect(422);
      await send(immutable).expect(422);
      await send(validWithExtra).expect(422);
    },
  );

  it.each(["__proto__", "constructor", "prototype"])(
    "rejects the prototype-pollution-style key %s without persistence",
    async (key) => {
      const before = await request(app).get("/api/tenants").expect(200);
      const rawBody = JSON.stringify({ name: "Never persisted", [key]: {} });
      const response = await request(app)
        .post("/api/tenants")
        .set("content-type", "application/json")
        .send(rawBody)
        .expect(422);
      expect(response.body.error.details).toContainEqual(
        expect.objectContaining({ field: key, code: "unknown" }),
      );
      const after = await request(app).get("/api/tenants").expect(200);
      expect(after.body.data).toEqual(before.body.data);
    },
  );

  it("rejects tenant NUL characters through HTTP", async () => {
    const response = await request(app)
      .post("/api/tenants")
      .send({ name: "unsafe\u0000tenant" })
      .expect(422);
    expect(response.body.error).toMatchObject({ code: "validation" });
  });

  it("does not expose an entity through the wrong sync request", async () => {
    const response = await request(app)
      .get(
        `/api/tenants/${ids.tenantA}/sync-requests/${ids.requestB}/entities/${ids.entityA}`,
      )
      .expect(404);
    expect(response.body.error).toMatchObject({
      code: "not-found",
      message: "The requested resource was not found.",
    });
    expect(JSON.stringify(response.body)).not.toContain(ids.entityA);
  });

  it("returns a sanitized conflict for a duplicate sync entity", async () => {
    const response = await request(app)
      .post(
        `/api/tenants/${ids.tenantA}/sync-requests/${ids.requestA}/entities`,
      )
      .send({ entity: "client", syncType: "one_time" })
      .expect(409);
    expect(response.body.error).toMatchObject({
      code: "conflict",
      message: "This entity is already configured for the sync request.",
    });
    expect(response.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body.error).not.toHaveProperty("constraint");
    expect(JSON.stringify(response.body)).not.toMatch(
      /sync_entities_request_entity_unique|postgres|constraint|select |insert |stack/i,
    );
  });

  it("returns a generic safe response for an unexpected failure", async () => {
    const unsafeError = new Error(
      "SELECT secret FROM postgres at C:\\private\\server.ts DATABASE_URL=password",
    );
    unsafeError.stack = `${unsafeError.message}\n at C:\\private\\server.ts:1:1`;
    const failingApp = testApp({ tenantListError: unsafeError });
    const response = await request(failingApp).get("/api/tenants").expect(500);
    expect(response.body.error).toMatchObject({
      code: "internal",
      message: "An unexpected error occurred.",
      details: [],
    });
    expect(response.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(response.body)).not.toMatch(
      /select |postgres|private|server\.ts|database_url|password|stack/i,
    );
  });

  it("returns the safe established response for an oversized JSON body", async () => {
    const response = await request(app)
      .post("/api/tenants")
      .send({ name: "x".repeat(101 * 1024) })
      .expect(413);
    expect(response.body.error).toMatchObject({
      code: "payload-too-large",
      message: "The request body is too large.",
      details: [],
    });
    expect(response.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(response.body)).not.toMatch(
      /postgres|constraint|stack|select |insert /i,
    );
  });
});
