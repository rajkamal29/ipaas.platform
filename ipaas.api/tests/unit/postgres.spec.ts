import { describe, expect, it } from "vitest";
import { mapSyncEntity } from "../../src/infrastructure/postgres/mappers/sync-entity.mapper";
import { mapTenant } from "../../src/infrastructure/postgres/mappers/tenant.mapper";
import { translatePostgresError } from "../../src/infrastructure/postgres/postgres-error";

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
