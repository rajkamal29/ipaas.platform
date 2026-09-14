import { inject, Injectable } from '@angular/core';
import {
  SYNC_REQUEST_REPOSITORY,
  TENANT_REPOSITORY,
} from '../../data-access/tokens/repository.tokens';
import type { TenantInput } from '../../data-access/contracts/tenant.repository';
import type { SyncRequest } from '../../domain/models/sync-request';
import type { Tenant } from '../../domain/models/tenant';
import { AsyncResource, SubmissionState } from '../../shared/state/async-state';
import { TenantContextService } from './tenant-context.service';

interface TenantDetailData {
  readonly tenant: Tenant;
  readonly requests: readonly SyncRequest[];
}

@Injectable()
export class TenantFacade {
  private readonly tenants = inject(TENANT_REPOSITORY);
  private readonly requests = inject(SYNC_REQUEST_REPOSITORY);
  private readonly context = inject(TenantContextService);
  readonly list = new AsyncResource<readonly Tenant[]>();
  readonly detail = new AsyncResource<TenantDetailData>();
  readonly submission = new SubmissionState();

  loadList(): Promise<void> {
    return this.list.load(() => this.tenants.list(), 'Could not load tenants. Please try again.');
  }

  loadDetail(tenantId: string | null): Promise<void> {
    return this.detail.load(async () => {
      const tenant = await this.context.requireTenant(tenantId);
      return { tenant, requests: await this.requests.list({ tenantId: tenant.id }) };
    }, 'Could not load this tenant. Please try again.');
  }

  create(input: TenantInput): Promise<Tenant | null> {
    return this.submission.run(
      () => this.tenants.create(input),
      'Could not save the tenant. Please try again.',
      'A tenant with this exact name already exists. Choose another name.',
    );
  }
}
