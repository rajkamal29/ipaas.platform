import { Injectable } from '@angular/core';
import type {
  EffectiveMapping,
  MappingProfile,
  TenantMappingKey,
} from '../../../domain/models/mapping-profile';
import { validateTenantMappingKey } from '../../../domain/validation/model-validation';
import type { UpdateGlobalMappingProfile } from '../../contracts/global-mapping-profile.repository';
import type {
  CreateMappingProfile,
  MappingProfileFilter,
  MappingProfileRepository,
} from '../../contracts/mapping-profile.repository';
import { RepositoryError } from '../../contracts/repository-error';
import { activateProfile, mappingFields, matchesMapping, sameMappingKey } from './mapping-helpers';
import { assertId, MockCrudRepository } from './mock-crud.repository';

@Injectable()
export class MockMappingProfileRepository
  extends MockCrudRepository<
    'mappingProfiles',
    CreateMappingProfile,
    UpdateGlobalMappingProfile,
    MappingProfileFilter
  >
  implements MappingProfileRepository
{
  constructor() {
    super('mappingProfiles');
  }

  protected override build(input: CreateMappingProfile, id: string, now: string): MappingProfile {
    return {
      id,
      tenantId: input.tenantId,
      ...mappingFields({
        ...input,
        isActive: input.isActive === undefined ? true : input.isActive,
      }),
      createdAt: now,
    };
  }
  protected override replace(
    row: MappingProfile,
    input: UpdateGlobalMappingProfile,
  ): MappingProfile {
    return { ...row, ...mappingFields(input) };
  }
  protected override matches(row: MappingProfile, filter: MappingProfileFilter): boolean {
    return (
      matchesMapping(row, filter) &&
      (filter.tenantId === undefined || row.tenantId === filter.tenantId)
    );
  }

  async activate(id: string): Promise<MappingProfile> {
    assertId(id);
    return this.data.transaction((draft) => {
      draft.mappingProfiles = activateProfile(
        draft.mappingProfiles,
        id,
        (left, right) => left.tenantId === right.tenantId,
      );
      const selected = draft.mappingProfiles.find((row) => row.id === id);
      if (!selected) throw new RepositoryError('not-found', 'The mapping profile does not exist.');
      return selected;
    });
  }

  async resolveEffective(key: TenantMappingKey): Promise<EffectiveMapping> {
    const issues = validateTenantMappingKey(key);
    if (issues.length) throw new RepositoryError('validation', 'Invalid mapping lookup.', issues);
    const snapshot = this.data.snapshot();
    if (!snapshot.tenants.some((row) => row.id === key.tenantId)) {
      throw new RepositoryError('not-found', 'The tenant does not exist.');
    }
    const override = snapshot.mappingProfiles.find(
      (row) => row.tenantId === key.tenantId && row.isActive && sameMappingKey(row, key),
    );
    if (override) return { origin: 'tenant', profile: override };
    const global = snapshot.globalMappingProfiles.find(
      (row) => row.isActive && sameMappingKey(row, key),
    );
    return global ? { origin: 'global', profile: global } : { origin: 'missing', profile: null };
  }
}
