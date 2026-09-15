import type { Logger } from "../../../application/ports/logger.js";

const requiredSchema = {
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
} as const;

interface SchemaColumnRow extends Record<string, unknown> {
  table_name: string;
  column_name: string;
}

export interface SchemaQueryable {
  query(
    text: string,
    values: readonly unknown[],
  ): Promise<{ rows: SchemaColumnRow[] }>;
}

export async function verifyPlatformSchema(
  database: SchemaQueryable,
  logger: Logger,
): Promise<void> {
  const tableNames = Object.keys(requiredSchema);
  const result = await database.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [tableNames],
  );

  const actualColumns = new Map<string, Set<string>>();
  for (const row of result.rows) {
    const columns = actualColumns.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    actualColumns.set(row.table_name, columns);
  }

  const missing = Object.entries(requiredSchema).flatMap(([table, columns]) =>
    columns
      .filter((column) => !actualColumns.get(table)?.has(column))
      .map((column) => `${table}.${column}`),
  );

  if (missing.length > 0) {
    throw new Error(
      "The shared IPAAS Platform schema is missing required tables or columns: " +
        `${missing.join(", ")}. Run npm run migrate:up from ipaas.infra.`,
    );
  }

  logger.info("Shared IPAAS Platform database schema verified", {
    tableCount: tableNames.length,
  });
}
