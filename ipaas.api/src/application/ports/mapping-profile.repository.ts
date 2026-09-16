import type {
  CreateMappingProfileInput,
  MappingProfileFilter,
  MappingProfileKey,
  MappingProfileWriteInput,
} from "../contracts/mapping-profile.contracts";
import type { MappingProfile } from "../../domain/mapping-profile/mapping-profile";

export interface MappingProfileRepository {
  list(
    tenantId: string,
    filter: MappingProfileFilter,
  ): Promise<readonly MappingProfile[]>;
  get(id: string): Promise<MappingProfile | null>;
  create(
    tenantId: string,
    input: CreateMappingProfileInput,
  ): Promise<MappingProfile>;
  update(
    id: string,
    input: MappingProfileWriteInput,
  ): Promise<MappingProfile | null>;
  activate(tenantId: string, id: string): Promise<MappingProfile | null>;
  findActive(
    tenantId: string,
    key: MappingProfileKey,
  ): Promise<MappingProfile | null>;
}
