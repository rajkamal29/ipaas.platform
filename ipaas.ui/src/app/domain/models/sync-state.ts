import type { SyncRunStatus } from '../value-sets/database-values';
import type { JsonValue } from './json-value';

export interface SyncState {
  readonly id: string;
  readonly syncEntityId: string;
  readonly cursor: JsonValue | null;
  readonly lastRunAt: string | null;
  readonly lastRunStatus: SyncRunStatus | null;
  readonly lastError: string | null;
  readonly failed: JsonValue;
  readonly retry: JsonValue;
  readonly createdAt: string;
  readonly updatedAt: string;
}
