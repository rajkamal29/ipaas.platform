import type { Provider } from '../value-sets/database-values';

/** Safe API projection of an existing credential row. Secret material never enters this model. */
export interface Credential {
  readonly id: string;
  readonly tenantId: string;
  readonly provider: Provider;
  readonly state: 'configured';
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Derived from the absence of a row, never persisted as a credential. */
export interface MissingCredential {
  readonly id: null;
  readonly tenantId: string;
  readonly provider: Provider;
  readonly state: 'missing';
  readonly createdAt: null;
  readonly updatedAt: null;
}

export type CredentialView = Credential | MissingCredential;
