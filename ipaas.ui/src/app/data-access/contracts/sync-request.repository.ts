import type { SyncRequest } from '../../domain/models/sync-request';
import type { Provider } from '../../domain/value-sets/database-values';
import type { CrudRepository } from './crud-repository';

export interface SyncRequestInput {
  readonly source: Provider;
  readonly target: Provider;
}
export interface CreateSyncRequest extends SyncRequestInput {
  readonly tenantId: string;
}
export interface SyncRequestFilter {
  readonly tenantId?: string;
  readonly source?: Provider;
  readonly target?: Provider;
}
export type SyncRequestRepository = CrudRepository<
  SyncRequest,
  CreateSyncRequest,
  SyncRequestInput,
  SyncRequestFilter
>;
