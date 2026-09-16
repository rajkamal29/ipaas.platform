import type {
  TenantListFilter,
  TenantWriteInput,
} from "../contracts/tenant.contracts";
import type { Tenant } from "../../domain/tenant/tenant";

export interface TenantRepository {
  list(filter: TenantListFilter): Promise<readonly Tenant[]>;
  get(id: string): Promise<Tenant | null>;
  create(input: TenantWriteInput): Promise<Tenant>;
  update(id: string, input: TenantWriteInput): Promise<Tenant | null>;
}
