import type { Tenant } from '../../domain/models/tenant';
import type { CrudRepository } from './crud-repository';

export interface TenantInput {
  readonly name: string;
}
export interface TenantFilter {
  readonly name?: string;
}
export type TenantRepository = CrudRepository<Tenant, TenantInput, TenantInput, TenantFilter>;
