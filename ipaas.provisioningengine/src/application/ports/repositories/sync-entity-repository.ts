import type { SyncEntity } from "../../../domain/entities/sync-entity.js";
import type { SyncEntityStatus } from "../../../domain/enums/platform-values.js";
import type { Uuid } from "../../../domain/value-objects/uuid.js";
export interface SyncEntityRepository {
  getById(id: Uuid): Promise<SyncEntity | null>;
  /** Conditional transition; false means the row was removed or its status changed. */
  updateStatus(
    id: Uuid,
    expected: SyncEntityStatus,
    next: SyncEntityStatus,
  ): Promise<boolean>;
}
