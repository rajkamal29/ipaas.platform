import type { Pool } from "pg";
import type {
  CreateMappingProfileInput,
  MappingProfileFilter,
  MappingProfileKey,
  MappingProfileWriteInput,
} from "../../application/contracts/mapping-profile.contracts";
import type { MappingProfileRepository } from "../../application/ports/mapping-profile.repository";
import {
  mapMappingProfile,
  type MappingProfileRow,
} from "./mappers/mapping-profile.mapper";
import { withPostgresErrors } from "./postgres-error";
import { requiredRow } from "./required-row";
import { withTransaction } from "./transaction";

const columns =
  "id, tenant_id, provider, entity, direction, version, field_mappings, is_active, created_at";

export class PostgresMappingProfileRepository implements MappingProfileRepository {
  constructor(private readonly pool: Pool) {}

  async list(tenantId: string, filter: MappingProfileFilter) {
    const values: unknown[] = [tenantId];
    const clauses = ["tenant_id = $1"];
    for (const [column, value] of [
      ["provider", filter.provider],
      ["entity", filter.entity],
      ["direction", filter.direction],
      ["is_active", filter.isActive],
    ] as const) {
      if (value !== undefined) {
        values.push(value);
        clauses.push(`${column} = $${String(values.length)}`);
      }
    }
    const result = await this.pool.query<MappingProfileRow>(
      `SELECT ${columns} FROM mapping_profiles WHERE ${clauses.join(" AND ")}`,
      values,
    );
    return result.rows.map(mapMappingProfile);
  }

  async get(id: string) {
    const result = await this.pool.query<MappingProfileRow>(
      `SELECT ${columns} FROM mapping_profiles WHERE id = $1`,
      [id],
    );
    return result.rows[0] === undefined
      ? null
      : mapMappingProfile(result.rows[0]);
  }

  create(tenantId: string, input: CreateMappingProfileInput) {
    return withPostgresErrors(async () => {
      const result = await this.pool.query<MappingProfileRow>(
        `INSERT INTO mapping_profiles
         (tenant_id, provider, entity, direction, version, field_mappings, is_active)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING ${columns}`,
        [
          tenantId,
          input.provider,
          input.entity,
          input.direction,
          input.version,
          JSON.stringify(input.fieldMappings),
          input.isActive ?? true,
        ],
      );
      return mapMappingProfile(requiredRow(result.rows));
    });
  }

  update(id: string, input: MappingProfileWriteInput) {
    return withPostgresErrors(async () => {
      const result = await this.pool.query<MappingProfileRow>(
        `UPDATE mapping_profiles
         SET provider = $2, entity = $3, direction = $4, version = $5,
             field_mappings = $6::jsonb, is_active = $7
         WHERE id = $1 RETURNING ${columns}`,
        [
          id,
          input.provider,
          input.entity,
          input.direction,
          input.version,
          JSON.stringify(input.fieldMappings),
          input.isActive,
        ],
      );
      return result.rows[0] === undefined
        ? null
        : mapMappingProfile(result.rows[0]);
    });
  }

  activate(tenantId: string, id: string) {
    return withPostgresErrors(() =>
      withTransaction(this.pool, async (client) => {
        const selected = await client.query<MappingProfileRow>(
          `SELECT ${columns} FROM mapping_profiles
           WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [id, tenantId],
        );
        const row = selected.rows[0];
        if (row === undefined) return null;
        await client.query(
          `UPDATE mapping_profiles SET is_active = false
           WHERE tenant_id = $1 AND provider = $2 AND entity = $3
             AND direction = $4 AND is_active = true`,
          [tenantId, row.provider, row.entity, row.direction],
        );
        const result = await client.query<MappingProfileRow>(
          `UPDATE mapping_profiles SET is_active = true
           WHERE id = $1 AND tenant_id = $2 RETURNING ${columns}`,
          [id, tenantId],
        );
        return mapMappingProfile(requiredRow(result.rows));
      }),
    );
  }

  async findActive(tenantId: string, key: MappingProfileKey) {
    const result = await this.pool.query<MappingProfileRow>(
      `SELECT ${columns} FROM mapping_profiles
       WHERE tenant_id = $1 AND provider = $2 AND entity = $3
         AND direction = $4 AND is_active = true LIMIT 1`,
      [tenantId, key.provider, key.entity, key.direction],
    );
    return result.rows[0] === undefined
      ? null
      : mapMappingProfile(result.rows[0]);
  }
}
