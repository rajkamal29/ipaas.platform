import type { Pool } from "pg";
import type {
  TenantListFilter,
  TenantWriteInput,
} from "../../application/contracts/tenant.contracts";
import type { TenantRepository } from "../../application/ports/tenant.repository";
import { mapTenant, type TenantRow } from "./mappers/tenant.mapper";
import { withPostgresErrors } from "./postgres-error";
import { requiredRow } from "./required-row";

export class PostgresTenantRepository implements TenantRepository {
  constructor(private readonly pool: Pool) {}

  async list(filter: TenantListFilter) {
    const result =
      filter.name === undefined
        ? await this.pool.query<TenantRow>(
            "SELECT id, name, created_at FROM tenants",
          )
        : await this.pool.query<TenantRow>(
            "SELECT id, name, created_at FROM tenants WHERE name = $1",
            [filter.name],
          );
    return result.rows.map(mapTenant);
  }

  async get(id: string) {
    const result = await this.pool.query<TenantRow>(
      "SELECT id, name, created_at FROM tenants WHERE id = $1",
      [id],
    );
    return result.rows[0] === undefined ? null : mapTenant(result.rows[0]);
  }

  create(input: TenantWriteInput) {
    return withPostgresErrors(async () => {
      const result = await this.pool.query<TenantRow>(
        "INSERT INTO tenants (name) VALUES ($1) RETURNING id, name, created_at",
        [input.name],
      );
      return mapTenant(requiredRow(result.rows));
    });
  }

  update(id: string, input: TenantWriteInput) {
    return withPostgresErrors(async () => {
      const result = await this.pool.query<TenantRow>(
        "UPDATE tenants SET name = $2 WHERE id = $1 RETURNING id, name, created_at",
        [id, input.name],
      );
      return result.rows[0] === undefined ? null : mapTenant(result.rows[0]);
    });
  }
}
