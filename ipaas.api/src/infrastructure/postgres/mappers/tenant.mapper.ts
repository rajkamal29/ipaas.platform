import type { Tenant } from "../../../domain/tenant/tenant";

export interface TenantRow {
  readonly id: string;
  readonly name: string;
  readonly created_at: Date;
}

export function mapTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
  };
}
