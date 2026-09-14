import { Injectable } from '@angular/core';
import type { Tenant } from '../../../domain/models/tenant';
import type {
  TenantFilter,
  TenantInput,
  TenantRepository,
} from '../../contracts/tenant.repository';
import { MockCrudRepository } from './mock-crud.repository';

@Injectable()
export class MockTenantRepository
  extends MockCrudRepository<'tenants', TenantInput, TenantInput, TenantFilter>
  implements TenantRepository
{
  constructor() {
    super('tenants');
  }

  protected override build(input: TenantInput, id: string, now: string): Tenant {
    return { id, name: input.name, createdAt: now };
  }
  protected override replace(row: Tenant, input: TenantInput): Tenant {
    return { ...row, name: input.name };
  }
  protected override matches(row: Tenant, filter: TenantFilter): boolean {
    return filter.name === undefined || row.name === filter.name;
  }
}
