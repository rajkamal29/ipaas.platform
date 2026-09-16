import type {
  CreateSyncEntityRequest,
  SyncEntityOutput,
  UpdateSyncEntityRequest,
} from "../contracts/sync-entity.contracts";
import { NotFoundError } from "../errors/not-found-error";
import { toSyncEntityOutput } from "../mappers/sync-entity-output.mapper";
import type { SyncEntityRepository } from "../ports/sync-entity.repository";
import type { SyncRequestRepository } from "../ports/sync-request.repository";
import type { TenantRepository } from "../ports/tenant.repository";
import {
  validateCreateSyncEntityInput,
  validateUpdateSyncEntityInput,
} from "../validation/sync-entity.validation";
import { requireUuid } from "../validation/validation";
import type { SyncRequest } from "../../domain/sync-request/sync-request";

export class SyncEntityUseCase {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly requests: SyncRequestRepository,
    private readonly entities: SyncEntityRepository,
  ) {}

  private async requireRequest(
    tenantId: string,
    requestId: string,
  ): Promise<SyncRequest> {
    const ownerId = requireUuid(tenantId, "tenantId");
    if ((await this.tenants.get(ownerId)) === null) throw new NotFoundError();
    const syncRequest = await this.requests.get(
      requireUuid(requestId, "requestId"),
    );
    if (syncRequest?.tenantId !== ownerId) throw new NotFoundError();
    return syncRequest;
  }

  private async requireOwned(
    tenantId: string,
    requestId: string,
    entityId: string,
  ) {
    const syncRequest = await this.requireRequest(tenantId, requestId);
    const entity = await this.entities.get(requireUuid(entityId, "entityId"));
    if (entity?.syncRequestId !== syncRequest.id) throw new NotFoundError();
    return entity;
  }

  async list(
    tenantId: string,
    requestId: string,
  ): Promise<readonly SyncEntityOutput[]> {
    const syncRequest = await this.requireRequest(tenantId, requestId);
    return (await this.entities.list(syncRequest.id)).map(toSyncEntityOutput);
  }

  async get(
    tenantId: string,
    requestId: string,
    entityId: string,
  ): Promise<SyncEntityOutput> {
    return toSyncEntityOutput(
      await this.requireOwned(tenantId, requestId, entityId),
    );
  }

  async create(
    tenantId: string,
    requestId: string,
    request: CreateSyncEntityRequest,
  ): Promise<SyncEntityOutput> {
    const syncRequest = await this.requireRequest(tenantId, requestId);
    return toSyncEntityOutput(
      await this.entities.create(
        syncRequest.id,
        validateCreateSyncEntityInput(request.body),
      ),
    );
  }

  async update(
    tenantId: string,
    requestId: string,
    entityId: string,
    request: UpdateSyncEntityRequest,
  ): Promise<SyncEntityOutput> {
    const current = await this.requireOwned(tenantId, requestId, entityId);
    const updated = await this.entities.update(
      current.id,
      validateUpdateSyncEntityInput(request.body),
    );
    if (updated === null) throw new NotFoundError();
    return toSyncEntityOutput(updated);
  }
}
