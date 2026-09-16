import type {
  MappingProfileListInput,
  MappingProfileOutput,
  MappingProfileWriteRequest,
} from "../contracts/mapping-profile.contracts";
import { NotFoundError } from "../errors/not-found-error";
import { toMappingProfileOutput } from "../mappers/mapping-profile-output.mapper";
import type { GlobalMappingProfileRepository } from "../ports/global-mapping-profile.repository";
import {
  validateCreateMappingProfile,
  validateMappingFilter,
  validateUpdateMappingProfile,
} from "../validation/mapping-profile.validation";
import { requireUuid } from "../validation/validation";

export class GlobalMappingProfileUseCase {
  constructor(private readonly mappings: GlobalMappingProfileRepository) {}

  async list(
    input: MappingProfileListInput,
  ): Promise<readonly MappingProfileOutput[]> {
    return (await this.mappings.list(validateMappingFilter(input))).map(
      toMappingProfileOutput,
    );
  }

  async get(profileId: string): Promise<MappingProfileOutput> {
    const row = await this.mappings.get(requireUuid(profileId, "profileId"));
    if (row === null) throw new NotFoundError();
    return toMappingProfileOutput(row);
  }

  async create(
    request: MappingProfileWriteRequest,
  ): Promise<MappingProfileOutput> {
    return toMappingProfileOutput(
      await this.mappings.create(validateCreateMappingProfile(request.body)),
    );
  }

  async update(
    profileId: string,
    request: MappingProfileWriteRequest,
  ): Promise<MappingProfileOutput> {
    const updated = await this.mappings.update(
      requireUuid(profileId, "profileId"),
      validateUpdateMappingProfile(request.body),
    );
    if (updated === null) throw new NotFoundError();
    return toMappingProfileOutput(updated);
  }

  async activate(profileId: string): Promise<MappingProfileOutput> {
    const activated = await this.mappings.activate(
      requireUuid(profileId, "profileId"),
    );
    if (activated === null) throw new NotFoundError();
    return toMappingProfileOutput(activated);
  }
}
