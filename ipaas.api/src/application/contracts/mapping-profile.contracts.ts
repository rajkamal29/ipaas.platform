import type { JsonValue } from "../../domain/json-value";
import type { EntityType } from "../../domain/sync-entity/sync-entity";
import type { Provider } from "../../domain/sync-request/sync-request";
import type { MappingDirection } from "../../domain/mapping-profile/mapping-profile";

export interface MappingProfileListInput {
  readonly provider?: unknown;
  readonly entity?: unknown;
  readonly direction?: unknown;
  readonly isActive?: unknown;
}

export interface MappingProfileFilter {
  readonly provider?: Provider;
  readonly entity?: EntityType;
  readonly direction?: MappingDirection;
  readonly isActive?: boolean;
}

export interface MappingProfileKey {
  readonly provider: Provider;
  readonly entity: EntityType;
  readonly direction: MappingDirection;
}

export interface MappingProfileWriteInput extends MappingProfileKey {
  readonly version: number;
  readonly fieldMappings: JsonValue;
  readonly isActive: boolean;
}

export type CreateMappingProfileInput = Omit<
  MappingProfileWriteInput,
  "isActive"
> & {
  readonly isActive?: boolean;
};

export interface MappingProfileWriteRequest {
  readonly body: unknown;
}

export interface MappingProfileOutput extends MappingProfileWriteInput {
  readonly id: string;
  readonly createdAt: string;
}

export interface TenantMappingProfileOutput extends MappingProfileOutput {
  readonly tenantId: string;
}

export interface EffectiveMappingInput {
  readonly provider?: unknown;
  readonly entity?: unknown;
  readonly direction?: unknown;
}

export type EffectiveMappingOutput =
  | { readonly origin: "tenant"; readonly profile: TenantMappingProfileOutput }
  | { readonly origin: "global"; readonly profile: MappingProfileOutput }
  | { readonly origin: "missing"; readonly profile: null };
