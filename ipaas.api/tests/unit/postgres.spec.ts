import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { mapSyncEntity } from "../../src/infrastructure/postgres/mappers/sync-entity.mapper";
import { mapSyncState } from "../../src/infrastructure/postgres/mappers/sync-state.mapper";
import { mapTenant } from "../../src/infrastructure/postgres/mappers/tenant.mapper";
import { translatePostgresError } from "../../src/infrastructure/postgres/postgres-error";
import { PostgresSyncStateRepository } from "../../src/infrastructure/postgres/sync-state.repository";

describe("PostgreSQL adapters", () => {
  it("maps snake_case rows to camelCase domain models", () => {
    const date = new Date("2026-09-15T10:00:00Z");
    expect(mapTenant({ id: "id", name: "name", created_at: date })).toEqual({
      id: "id",
      name: "name",
      createdAt: date.toISOString(),
    });
    expect(
      mapSyncEntity({
        id: "e",
        sync_request_id: "r",
        entity: "client",
        sync_type: "interval",
        status: "active",
        interval_seconds: 60,
        created_at: date,
        updated_at: date,
      }),
    ).toEqual({
      id: "e",
      syncRequestId: "r",
      entity: "client",
      syncType: "interval",
      status: "active",
      intervalSeconds: 60,
      createdAt: date.toISOString(),
      updatedAt: date.toISOString(),
    });
  });

  it("maps sync state timestamps and exposes only derived collection counts", () => {
    const date = new Date("2026-09-15T10:00:00Z");
    expect(
      mapSyncState({
        sync_entity_id: "e",
        last_run_status: "failed",
        updated_at: date,
        failed: [{ external_id: "1" }, { external_id: "2" }],
        retry: [{ external_id: "3" }],
      }),
    ).toEqual({
      syncEntityId: "e",
      lastRunStatus: "failed",
      updatedAt: date.toISOString(),
      failedCount: 2,
      retryCount: 1,
    });
  });

  it("maps null, empty, or malformed sync state collections to zero counts", () => {
    const date = new Date("2026-09-15T10:00:00Z");
    expect(
      mapSyncState({
        sync_entity_id: "e",
        last_run_status: null,
        updated_at: date,
        failed: null,
        retry: [],
      }),
    ).toMatchObject({ failedCount: 0, retryCount: 0 });
    expect(
      mapSyncState({
        sync_entity_id: "e",
        last_run_status: null,
        updated_at: date,
        failed: { unexpected: true },
        retry: undefined,
      }),
    ).toMatchObject({ failedCount: 0, retryCount: 0 });
  });

  it("retrieves multiple sync states in one parameterized PostgreSQL query", async () => {
    const date = new Date("2026-09-15T10:00:00Z");
    const query = vi.fn(async () => ({
      rows: [
        {
          sync_entity_id: "00000000-0000-4000-8000-000000000021",
          last_run_status: "success" as const,
          updated_at: date,
          failed: [],
          retry: [],
        },
      ],
    }));
    const repository = new PostgresSyncStateRepository({
      query,
    } as unknown as Pool);
    const ids = [
      "00000000-0000-4000-8000-000000000021",
      "00000000-0000-4000-8000-000000000022",
    ];

    await expect(repository.getBySyncEntityIds(ids)).resolves.toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("sync_entity_id = ANY($1::uuid[])"),
      [ids],
    );
  });

  it("does not query PostgreSQL for an empty sync state batch", async () => {
    const query = vi.fn();
    const repository = new PostgresSyncStateRepository({
      query,
    } as unknown as Pool);

    await expect(repository.getBySyncEntityIds([])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("translates known PostgreSQL errors without exposing raw details", () => {
    expect(() =>
      translatePostgresError({
        code: "23505",
        constraint: "tenants_name_key",
        detail: "secret sql detail",
      }),
    ).toThrow(
      expect.objectContaining({
        code: "conflict",
      }),
    );
    expect(() =>
      translatePostgresError({ code: "23503", constraint: "some_fk" }),
    ).toThrow(expect.objectContaining({ code: "validation" }));
  });
});
