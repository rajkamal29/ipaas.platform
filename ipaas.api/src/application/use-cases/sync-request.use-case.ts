import type {
  SyncRequestListFilter,
  SyncRequestListInput,
  SyncRequestOutput,
  SyncRequestWriteRequest,
} from "../contracts/sync-request.contracts";
import { NotFoundError } from "../errors/not-found-error";
import { toSyncRequestOutput } from "../mappers/sync-request-output.mapper";
import type { SyncRequestRepository } from "../ports/sync-request.repository";
import type { TenantRepository } from "../ports/tenant.repository";
import { validateSyncRequestInput } from "../validation/sync-request.validation";
import {
  optionalSingleValue,
  requireEnum,
  requireUuid,
} from "../validation/validation";
import { PROVIDERS } from "../../domain/sync-request/sync-request";

export class SyncRequestUseCase {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly requests: SyncRequestRepository,
  ) {}

  private async requireTenant(tenantId: string): Promise<string> {
    const id = requireUuid(tenantId, "tenantId");
    if ((await this.tenants.get(id)) === null) throw new NotFoundError();
    return id;
  }

  private async requireOwned(tenantId: string, requestId: string) {
    const ownerId = await this.requireTenant(tenantId);
    const syncRequest = await this.requests.get(
      requireUuid(requestId, "requestId"),
    );
    if (syncRequest?.tenantId !== ownerId) throw new NotFoundError();
    return syncRequest;
  }

  async list(
    tenantId: string,
    input: SyncRequestListInput,
  ): Promise<readonly SyncRequestOutput[]> {
    const ownerId = await this.requireTenant(tenantId);
    const source = optionalSingleValue(input.source, "source");
    const target = optionalSingleValue(input.target, "target");
    const filter: SyncRequestListFilter = {
      ...(source === undefined
        ? {}
        : { source: requireEnum(source, "source", PROVIDERS) }),
      ...(target === undefined
        ? {}
        : { target: requireEnum(target, "target", PROVIDERS) }),
    };
    return (await this.requests.list(ownerId, filter)).map(toSyncRequestOutput);
  }

  async get(tenantId: string, requestId: string): Promise<SyncRequestOutput> {
    return toSyncRequestOutput(await this.requireOwned(tenantId, requestId));
  }

  async create(
    tenantId: string,
    request: SyncRequestWriteRequest,
  ): Promise<SyncRequestOutput> {
    return toSyncRequestOutput(
      await this.requests.create(
        await this.requireTenant(tenantId),
        validateSyncRequestInput(request.body),
      ),
    );
  }

  async update(
    tenantId: string,
    requestId: string,
    request: SyncRequestWriteRequest,
  ): Promise<SyncRequestOutput> {
    const current = await this.requireOwned(tenantId, requestId);
    const updated = await this.requests.update(
      current.id,
      validateSyncRequestInput(request.body),
    );
    if (updated === null) throw new NotFoundError();
    return toSyncRequestOutput(updated);
  }
}
