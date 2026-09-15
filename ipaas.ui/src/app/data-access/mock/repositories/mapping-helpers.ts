import type {
  GlobalMappingProfile,
  MappingKey,
} from '../../../domain/models/global-mapping-profile';
import type {
  GlobalMappingProfileFilter,
  UpdateGlobalMappingProfile,
} from '../../contracts/global-mapping-profile.repository';
import { RepositoryError } from '../../contracts/repository-error';

export function mappingFields(input: UpdateGlobalMappingProfile): UpdateGlobalMappingProfile {
  return {
    provider: input.provider,
    entity: input.entity,
    direction: input.direction,
    version: input.version,
    fieldMappings: input.fieldMappings,
    isActive: input.isActive,
  };
}

export function sameMappingKey(left: MappingKey, right: MappingKey): boolean {
  return (
    left.provider === right.provider &&
    left.entity === right.entity &&
    left.direction === right.direction
  );
}

export function matchesMapping(
  row: GlobalMappingProfile,
  filter: GlobalMappingProfileFilter,
): boolean {
  return (
    (filter.provider === undefined || row.provider === filter.provider) &&
    (filter.entity === undefined || row.entity === filter.entity) &&
    (filter.direction === undefined || row.direction === filter.direction) &&
    (filter.isActive === undefined || row.isActive === filter.isActive)
  );
}

export function activateProfile<T extends GlobalMappingProfile>(
  rows: readonly T[],
  id: string,
  sameScope: (left: T, right: T) => boolean = () => true,
): T[] {
  const selected = rows.find((row) => row.id === id);
  if (!selected) throw new RepositoryError('not-found', 'The mapping profile does not exist.');
  return rows.map((row) =>
    sameScope(row, selected) && sameMappingKey(row, selected)
      ? { ...row, isActive: row.id === selected.id }
      : row,
  );
}
