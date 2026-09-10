import type { GlobalMappingProfile, MappingKey } from '../../domain/models/global-mapping-profile';
import type { CrudRepository } from './crud-repository';

export type UpdateGlobalMappingProfile = Omit<GlobalMappingProfile, 'id' | 'createdAt'>;
export type CreateGlobalMappingProfile = Omit<UpdateGlobalMappingProfile, 'isActive'> & {
  readonly isActive?: boolean;
};
export interface GlobalMappingProfileFilter extends Partial<MappingKey> {
  readonly isActive?: boolean;
}
export interface GlobalMappingProfileRepository extends CrudRepository<
  GlobalMappingProfile,
  CreateGlobalMappingProfile,
  UpdateGlobalMappingProfile,
  GlobalMappingProfileFilter
> {
  /** Atomically deactivates the previous active row for this key and activates the selected row. */
  activate(id: string): Promise<GlobalMappingProfile>;
}
