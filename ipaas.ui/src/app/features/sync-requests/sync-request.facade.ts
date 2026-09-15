import { inject, Injectable } from '@angular/core';
import type { SyncRequestInput } from '../../data-access/contracts/sync-request.repository';
import {
  SYNC_ENTITY_REPOSITORY,
  SYNC_REQUEST_REPOSITORY,
} from '../../data-access/tokens/repository.tokens';
import type { SyncEntity } from '../../domain/models/sync-entity';
import type { SyncRequest } from '../../domain/models/sync-request';
import type { Tenant } from '../../domain/models/tenant';
import { AsyncResource, SubmissionState } from '../../shared/state/async-state';
import { RequestContext, TenantContextService } from '../tenants/tenant-context.service';

interface RequestDetailData extends RequestContext {
  readonly entities: readonly SyncEntity[];
}

@Injectable()
export class SyncRequestFacade {
  private readonly requests = inject(SYNC_REQUEST_REPOSITORY);
  private readonly entities = inject(SYNC_ENTITY_REPOSITORY);
  private readonly context = inject(TenantContextService);
  readonly tenant = new AsyncResource<Tenant>();
  readonly detail = new AsyncResource<RequestDetailData>();
  readonly submission = new SubmissionState();

  loadTenant(tenantId: string | null): Promise<void> {
    this.submission.reset();
    return this.tenant.load(
      () => this.context.requireTenant(tenantId),
      'Could not load this tenant. Please try again.',
    );
  }

  loadDetail(tenantId: string | null, requestId: string | null): Promise<void> {
    return this.detail.load(async () => {
      const context = await this.context.requireRequest(tenantId, requestId);
      return {
        ...context,
        entities: await this.entities.list({ syncRequestId: context.request.id }),
      };
    }, 'Could not load this sync request. Please try again.');
  }

  create(tenantId: string, input: SyncRequestInput): Promise<SyncRequest | null> {
    return this.submission.run(async () => {
      const tenant = await this.context.requireTenant(tenantId);
      return this.requests.create({ tenantId: tenant.id, ...input });
    }, 'Could not save the sync request. Please try again.');
  }
}
