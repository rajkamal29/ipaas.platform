import type { Pool } from "pg";
import type {
  CredentialRepository,
  CredentialWrite,
} from "../../application/ports/credential.repository";
import type { Provider } from "../../domain/sync-request/sync-request";
import { mapCredential, type CredentialRow } from "./mappers/credential.mapper";
import { withPostgresErrors } from "./postgres-error";
import { withTransaction } from "./transaction";

const columns = "id, tenant_id, provider, created_at, updated_at";

export class PostgresCredentialRepository implements CredentialRepository {
  constructor(private readonly pool: Pool) {}

  async list(tenantId: string) {
    const result = await this.pool.query<CredentialRow>(
      `SELECT ${columns} FROM credentials WHERE tenant_id = $1`,
      [tenantId],
    );
    return result.rows.map(mapCredential);
  }

  async get(tenantId: string, provider: Provider) {
    const result = await this.pool.query<CredentialRow>(
      `SELECT ${columns} FROM credentials WHERE tenant_id = $1 AND provider = $2`,
      [tenantId, provider],
    );
    return result.rows[0] === undefined ? null : mapCredential(result.rows[0]);
  }

  configure(tenantId: string, credentials: readonly CredentialWrite[]) {
    return withPostgresErrors(() =>
      withTransaction(this.pool, async (client) => {
        const configured = [];
        for (const credential of credentials) {
          const result = await client.query<CredentialRow>(
            `INSERT INTO credentials (tenant_id, provider, encrypted_payload, iv, auth_tag)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (tenant_id, provider) DO UPDATE
             SET encrypted_payload = EXCLUDED.encrypted_payload,
                 iv = EXCLUDED.iv,
                 auth_tag = EXCLUDED.auth_tag,
                 updated_at = now()
             RETURNING ${columns}`,
            [
              tenantId,
              credential.provider,
              credential.encrypted.encryptedPayload,
              credential.encrypted.iv,
              credential.encrypted.authTag,
            ],
          );
          const row = result.rows[0];
          if (row === undefined)
            throw new Error("Credential write returned no row.");
          configured.push(mapCredential(row));
        }
        return configured;
      }),
    );
  }
}
