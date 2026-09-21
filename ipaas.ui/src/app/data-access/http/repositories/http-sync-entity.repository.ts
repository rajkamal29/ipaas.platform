import { inject, Injectable } from '@angular/core';
import type { SyncEntity, SyncEntityRead } from '../../../domain/models/sync-entity';
import { RepositoryError } from '../../contracts/repository-error';
import type {
  CreateSyncEntity,
  SyncEntityFilter,
  SyncEntityRepository,
  SyncEntityRouteContext,
  UpdateSyncEntity,
} from '../../contracts/sync-entity.repository';
import { ApiClient } from '../api-client';
import {
  toSyncEntity,
  toSyncEntityRead,
  type SyncEntityDto,
  type SyncEntityReadDto,
} from '../resource-dtos';

@Injectable()
export class HttpSyncEntityRepository implements SyncEntityRepository {
  private readonly api = inject(ApiClient);

  async list(filter: SyncEntityFilter = {}): Promise<readonly SyncEntityRead[]> {
    const context = this.context(filter.tenantId, filter.syncRequestId);
    if (filter.entity !== undefined || filter.status !== undefined || filter.syncType !== undefined)
      throw new RepositoryError('validation', 'Server-side sync entity filters are not supported.');
    return (await this.api.get<readonly SyncEntityReadDto[]>(this.collectionPath(context))).map(
      toSyncEntityRead,
    );
  }

  async get(id: string, context?: SyncEntityRouteContext): Promise<SyncEntityRead | null> {
    const parent = this.requireContext(context);
    try {
      return toSyncEntityRead(
        await this.api.get<SyncEntityReadDto>(
          `${this.collectionPath(parent)}/${encodeURIComponent(id)}`,
        ),
      );
    } catch (error: unknown) {
      if (error instanceof RepositoryError && error.code === 'not-found') return null;
      throw error;
    }
  }

  async create(input: CreateSyncEntity): Promise<SyncEntity> {
    const context = this.context(input.tenantId, input.syncRequestId);
    const body = {
      entity: input.entity,
      syncType: input.syncType,
      intervalSeconds: input.intervalSeconds,
      ...(input.status === undefined ? {} : { status: input.status }),
    };
    return toSyncEntity(await this.api.post<SyncEntityDto>(this.collectionPath(context), body));
  }

  async update(
    id: string,
    input: UpdateSyncEntity,
    context?: SyncEntityRouteContext,
  ): Promise<SyncEntity> {
    const parent = this.requireContext(context);
    const body = {
      entity: input.entity,
      syncType: input.syncType,
      intervalSeconds: input.intervalSeconds,
      status: input.status,
    };
    return toSyncEntity(
      await this.api.put<SyncEntityDto>(
        `${this.collectionPath(parent)}/${encodeURIComponent(id)}`,
        body,
      ),
    );
  }

  delete(): Promise<void> {
    return Promise.reject(
      new RepositoryError('validation', 'Sync entity deletion is not supported.'),
    );
  }

  private context(tenantId: string | undefined, syncRequestId: string | undefined) {
    if (tenantId === undefined || syncRequestId === undefined)
      throw new RepositoryError(
        'validation',
        'A tenant and sync request are required for this operation.',
      );
    return { tenantId, syncRequestId };
  }

  private requireContext(context: SyncEntityRouteContext | undefined): SyncEntityRouteContext {
    return this.context(context?.tenantId, context?.syncRequestId);
  }

  private collectionPath(context: SyncEntityRouteContext): string {
    return `/tenants/${encodeURIComponent(context.tenantId)}/sync-requests/${encodeURIComponent(context.syncRequestId)}/entities`;
  }
}
