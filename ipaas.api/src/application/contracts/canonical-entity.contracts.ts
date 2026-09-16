import type { JsonValue } from "../../domain/json-value";
import type { EntityType } from "../../domain/sync-entity/sync-entity";

export interface CanonicalEntityListInput {
  readonly name?: unknown;
  readonly version?: unknown;
}

export interface CanonicalEntityListFilter {
  readonly name?: EntityType;
  readonly version?: number;
}

export interface CanonicalEntityOutput {
  readonly id: string;
  readonly name: EntityType;
  readonly version: number;
  readonly schema: JsonValue;
  readonly createdAt: string;
}
