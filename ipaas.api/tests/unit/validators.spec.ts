import { describe, expect, it } from "vitest";
import { validateTenantInput } from "../../src/application/validation/tenant.validation";
import { validateSyncRequestInput } from "../../src/application/validation/sync-request.validation";
import {
  validateCreateSyncEntityInput,
  validateUpdateSyncEntityInput,
} from "../../src/application/validation/sync-entity.validation";

describe("domain input validation", () => {
  it("preserves tenant text exactly and rejects NUL and unknown fields", () => {
    expect(validateTenantInput({ name: "  OculusIT  " })).toEqual({
      name: "  OculusIT  ",
    });
    expect(() => validateTenantInput({ name: "bad\0name" })).toThrow(/Invalid/);
    expect(() => validateTenantInput({ name: "ok", id: "immutable" })).toThrow(
      /Invalid/,
    );
  });

  it("allows equal supported providers and rejects unsupported providers", () => {
    expect(
      validateSyncRequestInput({ source: "keka", target: "keka" }),
    ).toEqual({ source: "keka", target: "keka" });
    expect(() =>
      validateSyncRequestInput({ source: "other", target: "keka" }),
    ).toThrow(/Invalid/);
  });

  it("enforces the discriminated interval schedule", () => {
    expect(
      validateCreateSyncEntityInput({
        entity: "client",
        syncType: "interval",
        intervalSeconds: 60,
      }),
    ).toEqual({ entity: "client", syncType: "interval", intervalSeconds: 60 });
    expect(
      validateCreateSyncEntityInput({ entity: "client", syncType: "one_time" }),
    ).toEqual({
      entity: "client",
      syncType: "one_time",
      intervalSeconds: null,
    });
    for (const intervalSeconds of [59, 60.5, 2_147_483_648, null]) {
      expect(() =>
        validateCreateSyncEntityInput({
          entity: "client",
          syncType: "interval",
          intervalSeconds,
        }),
      ).toThrow(/schedule/);
    }
    expect(() =>
      validateCreateSyncEntityInput({
        entity: "client",
        syncType: "real_time",
        intervalSeconds: 60,
      }),
    ).toThrow(/schedule/);
  });

  it("requires every mutable field for PUT and permits every database status", () => {
    for (const status of [
      "submitted",
      "provisioning",
      "active",
      "completed",
      "failed",
    ]) {
      expect(
        validateUpdateSyncEntityInput({
          entity: "project",
          syncType: "one_time",
          intervalSeconds: null,
          status,
        }),
      ).toMatchObject({ status });
    }
    expect(() =>
      validateUpdateSyncEntityInput({ entity: "client", syncType: "one_time" }),
    ).toThrow(/Invalid/);
  });
});
