import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { SyncRequest } from '../../../domain/models/sync-request';
import { RepositoryError } from '../../contracts/repository-error';
import type {
  CreateSyncRequest,
  SyncRequestFilter,
  SyncRequestInput,
  SyncRequestRepository,
} from '../../contracts/sync-request.repository';
import { ApiClient } from '../api-client';
import { toSyncRequest, type SyncRequestDto } from '../resource-dtos';

@Injectable()
export class HttpSyncRequestRepository implements SyncRequestRepository {
  private readonly api = inject(ApiClient);

  async list(filter: SyncRequestFilter = {}): Promise<readonly SyncRequest[]> {
    const tenantId = this.requireTenantId(filter.tenantId);
    let params = new HttpParams();
    if (filter.source !== undefined) params = params.set('source', filter.source);
    if (filter.target !== undefined) params = params.set('target', filter.target);
    return (
      await this.api.get<readonly SyncRequestDto[]>(
        `/tenants/${encodeURIComponent(tenantId)}/sync-requests`,
        params,
      )
    ).map(toSyncRequest);
  }

  async get(id: string, tenantId?: string): Promise<SyncRequest | null> {
    const ownerId = this.requireTenantId(tenantId);
    try {
      return toSyncRequest(
        await this.api.get<SyncRequestDto>(
          `/tenants/${encodeURIComponent(ownerId)}/sync-requests/${encodeURIComponent(id)}`,
        ),
      );
    } catch (error: unknown) {
      if (error instanceof RepositoryError && error.code === 'not-found') return null;
      throw error;
    }
  }

  async create(input: CreateSyncRequest): Promise<SyncRequest> {
    return toSyncRequest(
      await this.api.post<SyncRequestDto>(
        `/tenants/${encodeURIComponent(input.tenantId)}/sync-requests`,
        { source: input.source, target: input.target },
      ),
    );
  }

  async update(id: string, input: SyncRequestInput, tenantId?: string): Promise<SyncRequest> {
    const ownerId = this.requireTenantId(tenantId);
    return toSyncRequest(
      await this.api.put<SyncRequestDto>(
        `/tenants/${encodeURIComponent(ownerId)}/sync-requests/${encodeURIComponent(id)}`,
        input,
      ),
    );
  }

  delete(): Promise<void> {
    return Promise.reject(
      new RepositoryError('validation', 'Sync request deletion is not supported.'),
    );
  }

  private requireTenantId(value: string | undefined): string {
    if (value === undefined)
      throw new RepositoryError('validation', 'A tenant is required for this operation.');
    return value;
  }
}
