import type { CanonicalEntity } from '../../domain/models/canonical-entity';
import type { EntityType } from '../../domain/value-sets/database-values';
import type { CrudRepository } from './crud-repository';

export type CanonicalEntityInput = Omit<CanonicalEntity, 'id' | 'createdAt'>;
export interface CanonicalEntityFilter {
  readonly name?: EntityType;
  readonly version?: number;
}
export type CanonicalEntityRepository = CrudRepository<
  CanonicalEntity,
  CanonicalEntityInput,
  CanonicalEntityInput,
  CanonicalEntityFilter
>;
