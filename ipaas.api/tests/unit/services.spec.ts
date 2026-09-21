import { describe, expect, it, vi } from "vitest";
import type { SyncEntityRepository } from "../../src/application/ports/sync-entity.repository";
import type { SyncRequestRepository } from "../../src/application/ports/sync-request.repository";
import type { SyncStateRepository } from "../../src/application/ports/sync-state.repository";
import type { TenantRepository } from "../../src/application/ports/tenant.repository";
import { SyncEntityUseCase } from "../../src/application/use-cases/sync-entity.use-case";
import { SyncRequestUseCase } from "../../src/application/use-cases/sync-request.use-case";
import { SyncStateUseCase } from "../../src/application/use-cases/sync-state.use-case";

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
const entityB = {
  ...entityA,
  id: "00000000-0000-4000-8000-000000000022",
  entity: "project" as const,
};
const stateA = {
  syncEntityId: entityA.id,
  lastRunStatus: "success" as const,
  updatedAt: "2026-09-15T01:00:00.000Z",
  failedCount: 2,
  retryCount: 1,
};
const stateB = {
  syncEntityId: entityB.id,
  lastRunStatus: "failed" as const,
  updatedAt: "2026-09-15T02:00:00.000Z",
  failedCount: 0,
  retryCount: 3,
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
    list: vi.fn(async () => [entityA, entityB]),
    get: vi.fn(async (id) => (id === entityA.id ? entityA : null)),
    create: vi.fn(async (syncRequestId, input) => ({
      ...entityA,
      syncRequestId,
      ...input,
      status: input.status ?? "submitted",
    })),
    update: vi.fn(async (_id, input) => ({ ...entityA, ...input })),
  };
  const states: SyncStateRepository = {
    getBySyncEntityId: vi.fn(async (id: string) =>
      id === entityA.id ? stateA : id === entityB.id ? stateB : null,
    ),
    getBySyncEntityIds: vi.fn(async (ids: readonly string[]) =>
      [stateA, stateB].filter((state) => ids.includes(state.syncEntityId)),
    ),
  };
  const syncStates = new SyncStateUseCase(states);
  return { tenants, requests, entities, states, syncStates };
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
    const { tenants, requests, entities, states, syncStates } = repositories();
    const service = new SyncEntityUseCase(
      tenants,
      requests,
      entities,
      syncStates,
    );
    await expect(
      service.get(tenantB.id, requestA.id, entityA.id),
    ).rejects.toMatchObject({ code: "not-found" });
    expect(states.getBySyncEntityId).not.toHaveBeenCalled();
  });

  it("batch-enriches all listed entities without N+1 state lookups", async () => {
    const { tenants, requests, entities, states, syncStates } = repositories();
    const service = new SyncEntityUseCase(
      tenants,
      requests,
      entities,
      syncStates,
    );
    const listed = await service.list(tenantA.id, requestA.id);
    expect(entities.list).toHaveBeenCalledWith(requestA.id);
    expect(states.getBySyncEntityIds).toHaveBeenCalledTimes(1);
    expect(states.getBySyncEntityIds).toHaveBeenCalledWith([
      entityA.id,
      entityB.id,
    ]);
    expect(states.getBySyncEntityId).not.toHaveBeenCalled();
    expect(listed).toEqual([
      expect.objectContaining({
        id: entityA.id,
        lastRunStatus: "success",
        syncStateUpdatedAt: stateA.updatedAt,
        failedCount: 2,
        retryCount: 1,
      }),
      expect.objectContaining({
        id: entityB.id,
        lastRunStatus: "failed",
        syncStateUpdatedAt: stateB.updatedAt,
        failedCount: 0,
        retryCount: 3,
      }),
    ]);
  });

  it("enriches a single entity and defaults missing runtime state", async () => {
    const { tenants, requests, entities, states, syncStates } = repositories();
    const service = new SyncEntityUseCase(
      tenants,
      requests,
      entities,
      syncStates,
    );
    await expect(
      service.get(tenantA.id, requestA.id, entityA.id),
    ).resolves.toMatchObject({
      updatedAt: entityA.updatedAt,
      lastRunStatus: "success",
      syncStateUpdatedAt: stateA.updatedAt,
      failedCount: 2,
      retryCount: 1,
    });
    expect(states.getBySyncEntityId).toHaveBeenCalledWith(entityA.id);

    states.getBySyncEntityId = vi.fn(async () => null);
    await expect(
      service.get(tenantA.id, requestA.id, entityA.id),
    ).resolves.toMatchObject({
      updatedAt: entityA.updatedAt,
      lastRunStatus: null,
      syncStateUpdatedAt: null,
      failedCount: 0,
      retryCount: 0,
    });
  });

  it("performs full entity replacement without changing validation semantics", async () => {
    const { tenants, requests, entities, syncStates } = repositories();
    const service = new SyncEntityUseCase(
      tenants,
      requests,
      entities,
      syncStates,
    );
    const updated = await service.update(tenantA.id, requestA.id, entityA.id, {
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
    expect(updated).not.toHaveProperty("lastRunStatus");
    expect(updated).not.toHaveProperty("syncStateUpdatedAt");
    expect(updated).not.toHaveProperty("failedCount");
    expect(updated).not.toHaveProperty("retryCount");
  });
});
