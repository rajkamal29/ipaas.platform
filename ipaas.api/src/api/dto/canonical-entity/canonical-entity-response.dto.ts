import type { JsonValue } from "../../../domain/json-value";
import type { EntityType } from "../../../domain/sync-entity/sync-entity";

export interface CanonicalEntityResponseDto {
  readonly id: string;
  readonly name: EntityType;
  readonly version: number;
  readonly schema: JsonValue;
  readonly createdAt: string;
}
