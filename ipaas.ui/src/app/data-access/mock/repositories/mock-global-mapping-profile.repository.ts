import { Injectable } from '@angular/core';
import type { GlobalMappingProfile } from '../../../domain/models/global-mapping-profile';
import type {
  CreateGlobalMappingProfile,
  GlobalMappingProfileFilter,
  GlobalMappingProfileRepository,
  UpdateGlobalMappingProfile,
} from '../../contracts/global-mapping-profile.repository';
import { RepositoryError } from '../../contracts/repository-error';
import { activateProfile, mappingFields, matchesMapping } from './mapping-helpers';
import { assertId, MockCrudRepository } from './mock-crud.repository';

@Injectable()
export class MockGlobalMappingProfileRepository
  extends MockCrudRepository<
    'globalMappingProfiles',
    CreateGlobalMappingProfile,
    UpdateGlobalMappingProfile,
    GlobalMappingProfileFilter
  >
  implements GlobalMappingProfileRepository
{
  constructor() {
    super('globalMappingProfiles');
  }

  protected override build(
    input: CreateGlobalMappingProfile,
    id: string,
    now: string,
  ): GlobalMappingProfile {
    return {
      id,
      ...mappingFields({
        ...input,
        isActive: input.isActive === undefined ? true : input.isActive,
      }),
      createdAt: now,
    };
  }
  protected override replace(
    row: GlobalMappingProfile,
    input: UpdateGlobalMappingProfile,
  ): GlobalMappingProfile {
    return { ...row, ...mappingFields(input) };
  }
  protected override matches(
    row: GlobalMappingProfile,
    filter: GlobalMappingProfileFilter,
  ): boolean {
    return matchesMapping(row, filter);
  }

  async activate(id: string): Promise<GlobalMappingProfile> {
    assertId(id);
    return this.data.transaction((draft) => {
      draft.globalMappingProfiles = activateProfile(draft.globalMappingProfiles, id);
      const selected = draft.globalMappingProfiles.find((row) => row.id === id);
      if (!selected) throw new RepositoryError('not-found', 'The mapping profile does not exist.');
      return selected;
    });
  }
}
