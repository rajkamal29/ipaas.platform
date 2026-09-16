import type { TenantOutput } from "../contracts/tenant.contracts";
import type { Tenant } from "../../domain/tenant/tenant";

export function toTenantOutput(tenant: Tenant): TenantOutput {
  return { id: tenant.id, name: tenant.name, createdAt: tenant.createdAt };
}
