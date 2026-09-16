import type {
  MappingProfileOutput,
  TenantMappingProfileOutput,
} from "../contracts/mapping-profile.contracts";
import type {
  GlobalMappingProfile,
  MappingProfile,
} from "../../domain/mapping-profile/mapping-profile";

export function toMappingProfileOutput(
  value: GlobalMappingProfile,
): MappingProfileOutput {
  return { ...value };
}

export function toTenantMappingProfileOutput(
  value: MappingProfile,
): TenantMappingProfileOutput {
  return { ...value };
}
