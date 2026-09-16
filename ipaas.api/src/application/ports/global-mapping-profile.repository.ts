import type {
  CreateMappingProfileInput,
  MappingProfileFilter,
  MappingProfileWriteInput,
} from "../contracts/mapping-profile.contracts";
import type { GlobalMappingProfile } from "../../domain/mapping-profile/mapping-profile";

export interface GlobalMappingProfileRepository {
  list(filter: MappingProfileFilter): Promise<readonly GlobalMappingProfile[]>;
  get(id: string): Promise<GlobalMappingProfile | null>;
  create(input: CreateMappingProfileInput): Promise<GlobalMappingProfile>;
  update(
    id: string,
    input: MappingProfileWriteInput,
  ): Promise<GlobalMappingProfile | null>;
  activate(id: string): Promise<GlobalMappingProfile | null>;
  findActive(input: {
    readonly provider: GlobalMappingProfile["provider"];
    readonly entity: GlobalMappingProfile["entity"];
    readonly direction: GlobalMappingProfile["direction"];
  }): Promise<GlobalMappingProfile | null>;
}
