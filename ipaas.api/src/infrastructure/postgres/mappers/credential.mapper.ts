import type { Credential } from "../../../domain/credential/credential";
import type { Provider } from "../../../domain/sync-request/sync-request";

export interface CredentialRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly provider: Provider;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export function mapCredential(row: CredentialRow): Credential {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
