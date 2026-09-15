import type { EntityType } from '../value-sets/database-values';
import type { JsonValue } from './json-value';

export interface CanonicalEntity {
  readonly id: string;
  readonly name: EntityType;
  readonly version: number;
  readonly schema: JsonValue;
  readonly createdAt: string;
}
