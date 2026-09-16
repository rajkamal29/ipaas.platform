import type { JsonValue } from "../json-value";
import type { EntityType } from "../sync-entity/sync-entity";

export interface CanonicalEntity {
  readonly id: string;
  readonly name: EntityType;
  readonly version: number;
  readonly schema: JsonValue;
  readonly createdAt: string;
}
