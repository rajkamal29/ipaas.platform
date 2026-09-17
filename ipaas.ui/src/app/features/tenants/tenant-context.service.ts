import { inject, Injectable } from '@angular/core';
import { RouteContextError } from '../../core/errors/ui-feedback';
import {
  SYNC_REQUEST_REPOSITORY,
  TENANT_REPOSITORY,
} from '../../data-access/tokens/repository.tokens';
import type { SyncRequest } from '../../domain/models/sync-request';
import type { Tenant } from '../../domain/models/tenant';
import { isUuid } from '../../domain/validation/model-validation';

export interface RequestContext {
  readonly tenant: Tenant;
  readonly request: SyncRequest;
}

@Injectable({ providedIn: 'root' })
export class TenantContextService {
  private readonly tenants = inject(TENANT_REPOSITORY);
  private readonly requests = inject(SYNC_REQUEST_REPOSITORY);

  async requireTenant(id: string | null): Promise<Tenant> {
    if (!isUuid(id)) throw new RouteContextError('The tenant address contains an invalid ID.');
    const tenant = await this.tenants.get(id.toLowerCase());
    if (!tenant) throw new RouteContextError('Tenant not found. It may have been removed.');
    return tenant;
  }

  async requireRequest(tenantId: string | null, requestId: string | null): Promise<RequestContext> {
    if (!isUuid(requestId))
      throw new RouteContextError('The sync request address contains an invalid ID.');
    const tenant = await this.requireTenant(tenantId);
    const request = await this.requests.get(requestId.toLowerCase(), tenant.id);
    if (!request) throw new RouteContextError('Sync request not found. It may have been removed.');
    if (request.tenantId !== tenant.id) {
      throw new RouteContextError(
        'This sync request does not belong to the tenant in this address.',
      );
    }
    return { tenant, request };
  }
}
