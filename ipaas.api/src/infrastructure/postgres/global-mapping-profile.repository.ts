import type { Pool } from "pg";
import type {
  CreateMappingProfileInput,
  MappingProfileFilter,
  MappingProfileKey,
  MappingProfileWriteInput,
} from "../../application/contracts/mapping-profile.contracts";
import type { GlobalMappingProfileRepository } from "../../application/ports/global-mapping-profile.repository";
import {
  mapGlobalMappingProfile,
  type GlobalMappingProfileRow,
} from "./mappers/mapping-profile.mapper";
import { withPostgresErrors } from "./postgres-error";
import { requiredRow } from "./required-row";
import { withTransaction } from "./transaction";

const columns =
  "id, provider, entity, direction, version, field_mappings, is_active, created_at";

function filterSql(filter: MappingProfileFilter): {
  readonly where: string;
  readonly values: unknown[];
} {
  const values: unknown[] = [];
  const clauses: string[] = [];
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
  return {
    where: clauses.length === 0 ? "" : ` WHERE ${clauses.join(" AND ")}`,
    values,
  };
}

export class PostgresGlobalMappingProfileRepository implements GlobalMappingProfileRepository {
  constructor(private readonly pool: Pool) {}

  async list(filter: MappingProfileFilter) {
    const query = filterSql(filter);
    const result = await this.pool.query<GlobalMappingProfileRow>(
      `SELECT ${columns} FROM global_mapping_profiles${query.where}`,
      query.values,
    );
    return result.rows.map(mapGlobalMappingProfile);
  }

  async get(id: string) {
    const result = await this.pool.query<GlobalMappingProfileRow>(
      `SELECT ${columns} FROM global_mapping_profiles WHERE id = $1`,
      [id],
    );
    return result.rows[0] === undefined
      ? null
      : mapGlobalMappingProfile(result.rows[0]);
  }

  create(input: CreateMappingProfileInput) {
    return withPostgresErrors(async () => {
      const result = await this.pool.query<GlobalMappingProfileRow>(
        `INSERT INTO global_mapping_profiles
         (provider, entity, direction, version, field_mappings, is_active)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING ${columns}`,
        [
          input.provider,
          input.entity,
          input.direction,
          input.version,
          JSON.stringify(input.fieldMappings),
          input.isActive ?? true,
        ],
      );
      return mapGlobalMappingProfile(requiredRow(result.rows));
    });
  }

  update(id: string, input: MappingProfileWriteInput) {
    return withPostgresErrors(async () => {
      const result = await this.pool.query<GlobalMappingProfileRow>(
        `UPDATE global_mapping_profiles
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
        : mapGlobalMappingProfile(result.rows[0]);
    });
  }

  activate(id: string) {
    return withPostgresErrors(() =>
      withTransaction(this.pool, async (client) => {
        const selected = await client.query<GlobalMappingProfileRow>(
          `SELECT ${columns} FROM global_mapping_profiles WHERE id = $1 FOR UPDATE`,
          [id],
        );
        const row = selected.rows[0];
        if (row === undefined) return null;
        await client.query(
          `UPDATE global_mapping_profiles SET is_active = false
           WHERE provider = $1 AND entity = $2 AND direction = $3 AND is_active = true`,
          [row.provider, row.entity, row.direction],
        );
        const result = await client.query<GlobalMappingProfileRow>(
          `UPDATE global_mapping_profiles SET is_active = true WHERE id = $1 RETURNING ${columns}`,
          [id],
        );
        return mapGlobalMappingProfile(requiredRow(result.rows));
      }),
    );
  }

  async findActive(key: MappingProfileKey) {
    const result = await this.pool.query<GlobalMappingProfileRow>(
      `SELECT ${columns} FROM global_mapping_profiles
       WHERE provider = $1 AND entity = $2 AND direction = $3 AND is_active = true
       LIMIT 1`,
      [key.provider, key.entity, key.direction],
    );
    return result.rows[0] === undefined
      ? null
      : mapGlobalMappingProfile(result.rows[0]);
  }
}
