import type {
  EffectiveMappingInput,
  EffectiveMappingOutput,
  MappingProfileListInput,
  MappingProfileWriteRequest,
  TenantMappingProfileOutput,
} from "../contracts/mapping-profile.contracts";
import { NotFoundError } from "../errors/not-found-error";
import {
  toMappingProfileOutput,
  toTenantMappingProfileOutput,
} from "../mappers/mapping-profile-output.mapper";
import type { GlobalMappingProfileRepository } from "../ports/global-mapping-profile.repository";
import type { MappingProfileRepository } from "../ports/mapping-profile.repository";
import type { TenantRepository } from "../ports/tenant.repository";
import {
  validateCreateMappingProfile,
  validateEffectiveMapping,
  validateMappingFilter,
  validateUpdateMappingProfile,
} from "../validation/mapping-profile.validation";
import { requireUuid } from "../validation/validation";

export class MappingProfileUseCase {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly mappings: MappingProfileRepository,
    private readonly globalMappings: GlobalMappingProfileRepository,
  ) {}

  private async requireTenant(tenantId: string): Promise<string> {
    const id = requireUuid(tenantId, "tenantId");
    if ((await this.tenants.get(id)) === null) throw new NotFoundError();
    return id;
  }

  private async requireOwned(tenantId: string, profileId: string) {
    const ownerId = await this.requireTenant(tenantId);
    const profile = await this.mappings.get(
      requireUuid(profileId, "profileId"),
    );
    if (profile?.tenantId !== ownerId) throw new NotFoundError();
    return profile;
  }

  async list(
    tenantId: string,
    input: MappingProfileListInput,
  ): Promise<readonly TenantMappingProfileOutput[]> {
    const ownerId = await this.requireTenant(tenantId);
    return (
      await this.mappings.list(ownerId, validateMappingFilter(input))
    ).map(toTenantMappingProfileOutput);
  }

  async get(
    tenantId: string,
    profileId: string,
  ): Promise<TenantMappingProfileOutput> {
    return toTenantMappingProfileOutput(
      await this.requireOwned(tenantId, profileId),
    );
  }

  async create(
    tenantId: string,
    request: MappingProfileWriteRequest,
  ): Promise<TenantMappingProfileOutput> {
    return toTenantMappingProfileOutput(
      await this.mappings.create(
        await this.requireTenant(tenantId),
        validateCreateMappingProfile(request.body),
      ),
    );
  }

  async update(
    tenantId: string,
    profileId: string,
    request: MappingProfileWriteRequest,
  ): Promise<TenantMappingProfileOutput> {
    const current = await this.requireOwned(tenantId, profileId);
    const updated = await this.mappings.update(
      current.id,
      validateUpdateMappingProfile(request.body),
    );
    if (updated === null) throw new NotFoundError();
    return toTenantMappingProfileOutput(updated);
  }

  async activate(
    tenantId: string,
    profileId: string,
  ): Promise<TenantMappingProfileOutput> {
    const current = await this.requireOwned(tenantId, profileId);
    const activated = await this.mappings.activate(
      current.tenantId,
      current.id,
    );
    if (activated === null) throw new NotFoundError();
    return toTenantMappingProfileOutput(activated);
  }

  async resolveEffective(
    tenantId: string,
    input: EffectiveMappingInput,
  ): Promise<EffectiveMappingOutput> {
    const ownerId = await this.requireTenant(tenantId);
    const key = validateEffectiveMapping(input);
    const tenant = await this.mappings.findActive(ownerId, key);
    if (tenant !== null)
      return {
        origin: "tenant",
        profile: toTenantMappingProfileOutput(tenant),
      };
    const global = await this.globalMappings.findActive(key);
    return global === null
      ? { origin: "missing", profile: null }
      : { origin: "global", profile: toMappingProfileOutput(global) };
  }
}
