import { inject, Injectable } from '@angular/core';
import type { SyncSchedule } from '../../domain/models/sync-entity';
import type { EntityType } from '../../domain/value-sets/database-values';
import { SYNC_ENTITY_REPOSITORY } from '../../data-access/tokens/repository.tokens';
import type { SyncEntity } from '../../domain/models/sync-entity';
import { AsyncResource, SubmissionState } from '../../shared/state/async-state';
import { RequestContext, TenantContextService } from '../tenants/tenant-context.service';

export type SyncEntityConfiguration = SyncSchedule & { readonly entity: EntityType };
interface EntityCreateData extends RequestContext {
  readonly entities: readonly SyncEntity[];
}

@Injectable()
export class SyncEntityFacade {
  private readonly entities = inject(SYNC_ENTITY_REPOSITORY);
  private readonly contextLoader = inject(TenantContextService);
  readonly context = new AsyncResource<EntityCreateData>();
  readonly submission = new SubmissionState();

  loadContext(tenantId: string | null, requestId: string | null): Promise<void> {
    this.submission.reset();
    return this.context.load(async () => {
      const context = await this.contextLoader.requireRequest(tenantId, requestId);
      return {
        ...context,
        entities: await this.entities.list({ syncRequestId: context.request.id }),
      };
    }, 'Could not load this sync request. Please try again.');
  }

  create(
    tenantId: string,
    requestId: string,
    input: SyncEntityConfiguration,
  ): Promise<SyncEntity | null> {
    return this.submission.run(
      async () => {
        const { request } = await this.contextLoader.requireRequest(tenantId, requestId);
        return this.entities.create({ ...input, syncRequestId: request.id });
      },
      'Could not save the sync entity. Please try again.',
      'This entity type is already configured for this sync request. Choose another entity.',
    );
  }
}
