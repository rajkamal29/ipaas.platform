import type { Provider } from '../value-sets/database-values';

export interface SyncRequest {
  readonly id: string;
  readonly tenantId: string;
  readonly source: Provider;
  readonly target: Provider;
  readonly createdAt: string;
}
