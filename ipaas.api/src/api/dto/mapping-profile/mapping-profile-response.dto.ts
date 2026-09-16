import type { JsonValue } from "../../../domain/json-value";
import type { MappingDirection } from "../../../domain/mapping-profile/mapping-profile";
import type { EntityType } from "../../../domain/sync-entity/sync-entity";
import type { Provider } from "../../../domain/sync-request/sync-request";

export interface MappingProfileResponseDto {
  readonly id: string;
  readonly provider: Provider;
  readonly entity: EntityType;
  readonly direction: MappingDirection;
  readonly version: number;
  readonly fieldMappings: JsonValue;
  readonly isActive: boolean;
  readonly createdAt: string;
}

export interface TenantMappingProfileResponseDto extends MappingProfileResponseDto {
  readonly tenantId: string;
}

export type EffectiveMappingResponseDto =
  | {
      readonly origin: "tenant";
      readonly profile: TenantMappingProfileResponseDto;
    }
  | { readonly origin: "global"; readonly profile: MappingProfileResponseDto }
  | { readonly origin: "missing"; readonly profile: null };
