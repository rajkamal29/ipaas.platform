import type {
  EntityType,
  SyncEntityStatus,
  SyncType,
} from "../enums/platform-values.js";
import type { Uuid } from "../value-objects/uuid.js";
export interface SyncEntity {
  readonly id: Uuid;
  readonly syncRequestId: Uuid;
  readonly entity: EntityType;
  readonly syncType: SyncType;
  readonly status: SyncEntityStatus;
  readonly intervalSeconds: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
