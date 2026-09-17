import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Tenant } from '../../../domain/models/tenant';
import { RepositoryError } from '../../contracts/repository-error';
import type {
  TenantFilter,
  TenantInput,
  TenantRepository,
} from '../../contracts/tenant.repository';
import { ApiClient } from '../api-client';
import { toTenant, type TenantDto } from '../resource-dtos';

@Injectable()
export class HttpTenantRepository implements TenantRepository {
  private readonly api = inject(ApiClient);

  async list(filter: TenantFilter = {}): Promise<readonly Tenant[]> {
    let params = new HttpParams();
    if (filter.name !== undefined) params = params.set('name', filter.name);
    return (await this.api.get<readonly TenantDto[]>('/tenants', params)).map(toTenant);
  }

  async get(id: string): Promise<Tenant | null> {
    try {
      return toTenant(await this.api.get<TenantDto>(`/tenants/${encodeURIComponent(id)}`));
    } catch (error: unknown) {
      if (error instanceof RepositoryError && error.code === 'not-found') return null;
      throw error;
    }
  }

  async create(input: TenantInput): Promise<Tenant> {
    return toTenant(await this.api.post<TenantDto>('/tenants', input));
  }

  async update(id: string, input: TenantInput): Promise<Tenant> {
    return toTenant(await this.api.put<TenantDto>(`/tenants/${encodeURIComponent(id)}`, input));
  }

  delete(): Promise<void> {
    return Promise.reject(new RepositoryError('validation', 'Tenant deletion is not supported.'));
  }
}
