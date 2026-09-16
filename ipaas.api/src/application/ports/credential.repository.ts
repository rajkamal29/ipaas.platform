import type { Credential } from "../../domain/credential/credential";
import type { Provider } from "../../domain/sync-request/sync-request";
import type { EncryptedCredential } from "./credential-encryptor";

export interface CredentialWrite {
  readonly provider: Provider;
  readonly encrypted: EncryptedCredential;
}

export interface CredentialRepository {
  list(tenantId: string): Promise<readonly Credential[]>;
  get(tenantId: string, provider: Provider): Promise<Credential | null>;
  configure(
    tenantId: string,
    credentials: readonly CredentialWrite[],
  ): Promise<readonly Credential[]>;
}
