import type { Pool } from "pg";
import type { CanonicalEntityListFilter } from "../../application/contracts/canonical-entity.contracts";
import type { CanonicalEntityRepository } from "../../application/ports/canonical-entity.repository";
import {
  mapCanonicalEntity,
  type CanonicalEntityRow,
} from "./mappers/canonical-entity.mapper";

const columns = "id, name, version, schema, created_at";

export class PostgresCanonicalEntityRepository implements CanonicalEntityRepository {
  constructor(private readonly pool: Pool) {}

  async list(filter: CanonicalEntityListFilter) {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (filter.name !== undefined) {
      values.push(filter.name);
      clauses.push(`name = $${String(values.length)}`);
    }
    if (filter.version !== undefined) {
      values.push(filter.version);
      clauses.push(`version = $${String(values.length)}`);
    }
    const where = clauses.length === 0 ? "" : ` WHERE ${clauses.join(" AND ")}`;
    const result = await this.pool.query<CanonicalEntityRow>(
      `SELECT ${columns} FROM canonical_entities${where}`,
      values,
    );
    return result.rows.map(mapCanonicalEntity);
  }

  async get(id: string) {
    const result = await this.pool.query<CanonicalEntityRow>(
      `SELECT ${columns} FROM canonical_entities WHERE id = $1`,
      [id],
    );
    return result.rows[0] === undefined
      ? null
      : mapCanonicalEntity(result.rows[0]);
  }
}
