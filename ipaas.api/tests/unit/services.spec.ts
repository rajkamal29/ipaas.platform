import { describe, expect, it, vi } from "vitest";
import type { SyncEntityRepository } from "../../src/application/ports/sync-entity.repository";
import type { SyncRequestRepository } from "../../src/application/ports/sync-request.repository";
import type { TenantRepository } from "../../src/application/ports/tenant.repository";
import { SyncEntityUseCase } from "../../src/application/use-cases/sync-entity.use-case";
import { SyncRequestUseCase } from "../../src/application/use-cases/sync-request.use-case";

const tenantA = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "A",
  createdAt: "2026-09-15T00:00:00.000Z",
};
const tenantB = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "B",
  createdAt: "2026-09-15T00:00:00.000Z",
};
const requestA = {
  id: "00000000-0000-4000-8000-000000000011",
  tenantId: tenantA.id,
  source: "connectwise" as const,
  target: "keka" as const,
  createdAt: tenantA.createdAt,
};
const entityA = {
  id: "00000000-0000-4000-8000-000000000021",
  syncRequestId: requestA.id,
  entity: "client" as const,
  syncType: "interval" as const,
  intervalSeconds: 60,
  status: "active" as const,
  createdAt: tenantA.createdAt,
  updatedAt: tenantA.createdAt,
};

function repositories() {
  const tenants: TenantRepository = {
    list: vi.fn(async () => [tenantA, tenantB]),
    get: vi.fn(async (id) =>
      id === tenantA.id ? tenantA : id === tenantB.id ? tenantB : null,
    ),
    create: vi.fn(async (input) => ({ ...tenantA, ...input })),
    update: vi.fn(async (_id, input) => ({ ...tenantA, ...input })),
  };
  const requests: SyncRequestRepository = {
    list: vi.fn(async () => [requestA]),
    get: vi.fn(async (id) => (id === requestA.id ? requestA : null)),
    create: vi.fn(async (tenantId, input) => ({
      ...requestA,
      tenantId,
      ...input,
    })),
    update: vi.fn(async (_id, input) => ({ ...requestA, ...input })),
  };
  const entities: SyncEntityRepository = {
    list: vi.fn(async () => [entityA]),
    get: vi.fn(async (id) => (id === entityA.id ? entityA : null)),
    create: vi.fn(async (syncRequestId, input) => ({
      ...entityA,
      syncRequestId,
      ...input,
      status: input.status ?? "submitted",
    })),
    update: vi.fn(async (_id, input) => ({ ...entityA, ...input })),
  };
  return { tenants, requests, entities };
}

describe("application services", () => {
  it("protects sync requests from cross-tenant access without leaking existence", async () => {
    const { tenants, requests } = repositories();
    const service = new SyncRequestUseCase(tenants, requests);
    await expect(service.get(tenantB.id, requestA.id)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("protects entities through the complete tenant/request hierarchy", async () => {
    const { tenants, requests, entities } = repositories();
    const service = new SyncEntityUseCase(tenants, requests, entities);
    await expect(
      service.get(tenantB.id, requestA.id, entityA.id),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("lists all request entities and performs full entity replacement", async () => {
    const { tenants, requests, entities } = repositories();
    const service = new SyncEntityUseCase(tenants, requests, entities);
    await service.list(tenantA.id, requestA.id);
    expect(entities.list).toHaveBeenCalledWith(requestA.id);
    await service.update(tenantA.id, requestA.id, entityA.id, {
      body: {
        entity: "project",
        syncType: "one_time",
        intervalSeconds: null,
        status: "completed",
      },
    });
    expect(entities.update).toHaveBeenCalledWith(entityA.id, {
      entity: "project",
      syncType: "one_time",
      intervalSeconds: null,
      status: "completed",
    });
  });
});
