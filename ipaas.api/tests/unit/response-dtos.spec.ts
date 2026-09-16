import { describe, expect, it } from "vitest";
import { createApiResponse } from "../../src/api/dto/api-response";
import { toSyncEntityResponse } from "../../src/api/dto/sync-entity/sync-entity-response.mapper";
import { toSyncRequestResponse } from "../../src/api/dto/sync-request/sync-request-response.mapper";
import { toTenantResponse } from "../../src/api/dto/tenant/tenant-response.mapper";
import { toSyncEntityOutput } from "../../src/application/mappers/sync-entity-output.mapper";
import { toSyncRequestOutput } from "../../src/application/mappers/sync-request-output.mapper";
import { toTenantOutput } from "../../src/application/mappers/tenant-output.mapper";

const createdAt = "2026-09-15T00:00:00.000Z";

describe("HTTP response DTO boundary", () => {
  it("maps tenants by explicitly selecting public fields", () => {
    const tenant = {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Tenant",
      createdAt,
      internalMarker: "not public",
    };

    const output = toTenantOutput(tenant);
    expect(output).toEqual({
      id: tenant.id,
      name: tenant.name,
      createdAt,
    });
    expect(toTenantResponse(output)).toEqual(output);
  });

  it("maps sync requests by explicitly selecting public fields", () => {
    const syncRequest = {
      id: "00000000-0000-4000-8000-000000000011",
      tenantId: "00000000-0000-4000-8000-000000000001",
      source: "connectwise" as const,
      target: "keka" as const,
      createdAt,
      internalMarker: "not public",
    };

    const output = toSyncRequestOutput(syncRequest);
    expect(output).toEqual({
      id: syncRequest.id,
      tenantId: syncRequest.tenantId,
      source: "connectwise",
      target: "keka",
      createdAt,
    });
    expect(toSyncRequestResponse(output)).toEqual(output);
  });

  it("maps sync entities by explicitly selecting public fields", () => {
    const syncEntity = {
      id: "00000000-0000-4000-8000-000000000021",
      syncRequestId: "00000000-0000-4000-8000-000000000011",
      entity: "client" as const,
      syncType: "interval" as const,
      intervalSeconds: 60,
      status: "active" as const,
      createdAt,
      updatedAt: createdAt,
      internalMarker: "not public",
    };

    const output = toSyncEntityOutput(syncEntity);
    expect(output).toEqual({
      id: syncEntity.id,
      syncRequestId: syncEntity.syncRequestId,
      entity: "client",
      syncType: "interval",
      status: "active",
      createdAt,
      updatedAt: createdAt,
      intervalSeconds: 60,
    });
    expect(toSyncEntityResponse(output)).toEqual(output);
  });

  it("creates the minimal success envelope with an ISO-8601 timestamp", () => {
    const response = createApiResponse({ id: "resource" });

    expect(response.data).toEqual({ id: "resource" });
    expect(new Date(response.timestamp).toISOString()).toBe(response.timestamp);
    expect(response).not.toHaveProperty("success");
    expect(response).not.toHaveProperty("requestId");
  });
});
