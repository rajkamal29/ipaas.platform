import type {
  EffectiveMappingOutput,
  MappingProfileOutput,
  TenantMappingProfileOutput,
} from "../../../application/contracts/mapping-profile.contracts";
import type {
  EffectiveMappingResponseDto,
  MappingProfileResponseDto,
  TenantMappingProfileResponseDto,
} from "./mapping-profile-response.dto";

export function toMappingProfileResponse(
  value: MappingProfileOutput,
): MappingProfileResponseDto {
  return { ...value };
}

export function toTenantMappingProfileResponse(
  value: TenantMappingProfileOutput,
): TenantMappingProfileResponseDto {
  return { ...value };
}

export function toEffectiveMappingResponse(
  value: EffectiveMappingOutput,
): EffectiveMappingResponseDto {
  if (value.origin === "missing") return value;
  return value.origin === "tenant"
    ? {
        origin: "tenant",
        profile: toTenantMappingProfileResponse(value.profile),
      }
    : { origin: "global", profile: toMappingProfileResponse(value.profile) };
}
