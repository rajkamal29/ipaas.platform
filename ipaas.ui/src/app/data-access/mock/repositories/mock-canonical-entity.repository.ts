import { Injectable } from '@angular/core';
import type { CanonicalEntity } from '../../../domain/models/canonical-entity';
import type {
  CanonicalEntityFilter,
  CanonicalEntityInput,
  CanonicalEntityRepository,
} from '../../contracts/canonical-entity.repository';
import { MockCrudRepository } from './mock-crud.repository';

@Injectable()
export class MockCanonicalEntityRepository
  extends MockCrudRepository<
    'canonicalEntities',
    CanonicalEntityInput,
    CanonicalEntityInput,
    CanonicalEntityFilter
  >
  implements CanonicalEntityRepository
{
  constructor() {
    super('canonicalEntities');
  }

  protected override build(input: CanonicalEntityInput, id: string, now: string): CanonicalEntity {
    return { id, name: input.name, version: input.version, schema: input.schema, createdAt: now };
  }
  protected override replace(row: CanonicalEntity, input: CanonicalEntityInput): CanonicalEntity {
    return { ...row, name: input.name, version: input.version, schema: input.schema };
  }
  protected override matches(row: CanonicalEntity, filter: CanonicalEntityFilter): boolean {
    return (
      (filter.name === undefined || row.name === filter.name) &&
      (filter.version === undefined || row.version === filter.version)
    );
  }
}
