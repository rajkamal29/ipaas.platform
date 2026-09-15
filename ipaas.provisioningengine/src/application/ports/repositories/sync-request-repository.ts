import type { SyncRequest } from "../../../domain/entities/sync-request.js";
import type { Uuid } from "../../../domain/value-objects/uuid.js";
export interface SyncRequestRepository {
  getById(id: Uuid): Promise<SyncRequest | null>;
}
