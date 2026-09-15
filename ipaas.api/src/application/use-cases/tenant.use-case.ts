import type {
  TenantListInput,
  TenantOutput,
  TenantWriteRequest,
} from "../contracts/tenant.contracts";
import { NotFoundError } from "../errors/not-found-error";
import { toTenantOutput } from "../mappers/tenant-output.mapper";
import type { TenantRepository } from "../ports/tenant.repository";
import { validateTenantInput } from "../validation/tenant.validation";
import {
  optionalSingleValue,
  requireText,
  requireUuid,
} from "../validation/validation";

export class TenantUseCase {
  constructor(private readonly tenants: TenantRepository) {}

  async list(input: TenantListInput): Promise<readonly TenantOutput[]> {
    const parsed = optionalSingleValue(input.name, "name");
    const tenants = await this.tenants.list(
      parsed === undefined ? {} : { name: requireText(parsed, "name") },
    );
    return tenants.map(toTenantOutput);
  }

  async get(tenantId: string): Promise<TenantOutput> {
    const tenant = await this.tenants.get(requireUuid(tenantId, "tenantId"));
    if (tenant === null) throw new NotFoundError();
    return toTenantOutput(tenant);
  }

  async create(request: TenantWriteRequest): Promise<TenantOutput> {
    return toTenantOutput(
      await this.tenants.create(validateTenantInput(request.body)),
    );
  }

  async update(
    tenantId: string,
    request: TenantWriteRequest,
  ): Promise<TenantOutput> {
    const tenant = await this.tenants.update(
      requireUuid(tenantId, "tenantId"),
      validateTenantInput(request.body),
    );
    if (tenant === null) throw new NotFoundError();
    return toTenantOutput(tenant);
  }
}
