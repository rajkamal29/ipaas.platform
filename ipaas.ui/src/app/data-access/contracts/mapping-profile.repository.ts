import type {
  EffectiveMapping,
  MappingProfile,
  TenantMappingKey,
} from '../../domain/models/mapping-profile';
import type { CrudRepository } from './crud-repository';
import type {
  CreateGlobalMappingProfile,
  GlobalMappingProfileFilter,
  UpdateGlobalMappingProfile,
} from './global-mapping-profile.repository';

export type CreateMappingProfile = CreateGlobalMappingProfile & { readonly tenantId: string };
export interface MappingProfileFilter extends GlobalMappingProfileFilter {
  readonly tenantId?: string;
}
export interface MappingProfileRepository extends CrudRepository<
  MappingProfile,
  CreateMappingProfile,
  UpdateGlobalMappingProfile,
  MappingProfileFilter
> {
  activate(id: string): Promise<MappingProfile>;
  resolveEffective(key: TenantMappingKey): Promise<EffectiveMapping>;
}
