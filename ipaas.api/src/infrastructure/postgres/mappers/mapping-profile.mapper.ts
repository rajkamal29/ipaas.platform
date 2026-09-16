import type { JsonValue } from "../../../domain/json-value";
import type {
  GlobalMappingProfile,
  MappingDirection,
  MappingProfile,
} from "../../../domain/mapping-profile/mapping-profile";
import type { EntityType } from "../../../domain/sync-entity/sync-entity";
import type { Provider } from "../../../domain/sync-request/sync-request";

export interface GlobalMappingProfileRow {
  readonly id: string;
  readonly provider: Provider;
  readonly entity: EntityType;
  readonly direction: MappingDirection;
  readonly version: number;
  readonly field_mappings: JsonValue;
  readonly is_active: boolean;
  readonly created_at: Date;
}

export interface MappingProfileRow extends GlobalMappingProfileRow {
  readonly tenant_id: string;
}

export function mapGlobalMappingProfile(
  row: GlobalMappingProfileRow,
): GlobalMappingProfile {
  return {
    id: row.id,
    provider: row.provider,
    entity: row.entity,
    direction: row.direction,
    version: row.version,
    fieldMappings: row.field_mappings,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
  };
}

export function mapMappingProfile(row: MappingProfileRow): MappingProfile {
  return { tenantId: row.tenant_id, ...mapGlobalMappingProfile(row) };
}
