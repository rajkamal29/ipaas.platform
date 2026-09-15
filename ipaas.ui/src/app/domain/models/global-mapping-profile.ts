import type { EntityType, MappingDirection, Provider } from '../value-sets/database-values';
import type { JsonValue } from './json-value';

export interface MappingKey {
  readonly provider: Provider;
  readonly entity: EntityType;
  readonly direction: MappingDirection;
}

export interface GlobalMappingProfile extends MappingKey {
  readonly id: string;
  readonly version: number;
  readonly fieldMappings: JsonValue;
  readonly isActive: boolean;
  readonly createdAt: string;
}
