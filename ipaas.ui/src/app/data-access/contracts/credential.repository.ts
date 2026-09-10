import type { Credential, CredentialView } from '../../domain/models/credential';
import type { Provider } from '../../domain/value-sets/database-values';

/** Configuration/rotation awaits the backend secret-input contract; only safe reads are exposed. */
export interface CredentialRepository {
  list(tenantId: string): Promise<readonly Credential[]>;
  getForProvider(tenantId: string, provider: Provider): Promise<CredentialView>;
}
