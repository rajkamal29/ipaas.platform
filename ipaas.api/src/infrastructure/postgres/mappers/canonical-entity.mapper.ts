import type { CanonicalEntity } from "../../../domain/canonical-entity/canonical-entity";
import type { JsonValue } from "../../../domain/json-value";
import type { EntityType } from "../../../domain/sync-entity/sync-entity";

export interface CanonicalEntityRow {
  readonly id: string;
  readonly name: EntityType;
  readonly version: number;
  readonly schema: JsonValue;
  readonly created_at: Date;
}

export function mapCanonicalEntity(row: CanonicalEntityRow): CanonicalEntity {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    schema: row.schema,
    createdAt: row.created_at.toISOString(),
  };
}
