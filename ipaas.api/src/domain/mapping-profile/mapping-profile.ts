import type { JsonValue } from "../json-value";
import type { EntityType } from "../sync-entity/sync-entity";
import type { Provider } from "../sync-request/sync-request";

export const MAPPING_DIRECTIONS = ["inbound", "outbound"] as const;
export type MappingDirection = (typeof MAPPING_DIRECTIONS)[number];

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

export interface MappingProfile extends GlobalMappingProfile {
  readonly tenantId: string;
}
