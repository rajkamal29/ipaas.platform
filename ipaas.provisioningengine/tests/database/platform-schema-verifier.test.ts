import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Logger } from "../../src/infrastructure/logging/logger.js";
import {
  type SchemaQueryable,
  verifyPlatformSchema,
} from "../../src/infrastructure/persistence/postgres/platform-schema-verifier.js";

const expectedColumns: Record<string, string[]> = {
  tenants: ["id", "name", "created_at"],
  sync_requests: ["id", "tenant_id", "source", "target", "created_at"],
  sync_entities: [
    "id",
    "sync_request_id",
    "entity",
    "sync_type",
    "status",
    "interval_seconds",
    "created_at",
    "updated_at",
  ],
  credentials: [
    "id",
    "tenant_id",
    "provider",
    "encrypted_payload",
    "iv",
    "auth_tag",
    "created_at",
    "updated_at",
  ],
  sync_state: [
    "id",
    "sync_entity_id",
    "cursor",
    "last_run_at",
    "last_run_status",
    "last_error",
    "failed",
    "retry",
    "created_at",
    "updated_at",
  ],
  canonical_entities: ["id", "name", "version", "schema", "created_at"],
  mapping_profiles: [
    "id",
    "tenant_id",
    "provider",
    "entity",
    "direction",
    "version",
    "field_mappings",
    "is_active",
    "created_at",
  ],
  global_mapping_profiles: [
    "id",
    "provider",
    "entity",
    "direction",
    "version",
    "field_mappings",
    "is_active",
    "created_at",
  ],
};

describe("verifyPlatformSchema", () => {
  it("accepts the current shared platform schema", async () => {
    await assert.doesNotReject(
      verifyPlatformSchema(createDatabase(), new Logger("error")),
    );
  });

  it("reports a missing platform column with migration guidance", async () => {
    const database = createDatabase("sync_entities.interval_seconds");

    await assert.rejects(
      verifyPlatformSchema(database, new Logger("error")),
      /sync_entities\.interval_seconds.*ipaas\.infra/,
    );
  });
});

function createDatabase(omitted?: string): SchemaQueryable {
  return {
    query: async () => ({
      rows: Object.entries(expectedColumns).flatMap(([table_name, columns]) =>
        columns
          .filter((column_name) => `${table_name}.${column_name}` !== omitted)
          .map((column_name) => ({ table_name, column_name })),
      ),
    }),
  };
}
