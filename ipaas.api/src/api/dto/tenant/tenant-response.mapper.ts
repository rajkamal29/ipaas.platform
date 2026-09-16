import type { TenantOutput } from "../../../application/contracts/tenant.contracts";
import type { TenantResponseDto } from "./tenant-response.dto";

export function toTenantResponse(tenant: TenantOutput): TenantResponseDto {
  return { id: tenant.id, name: tenant.name, createdAt: tenant.createdAt };
}
