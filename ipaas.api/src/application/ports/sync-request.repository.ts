import type {
  SyncRequestListFilter,
  SyncRequestWriteInput,
} from "../contracts/sync-request.contracts";
import type { SyncRequest } from "../../domain/sync-request/sync-request";

export interface SyncRequestRepository {
  list(
    tenantId: string,
    filter: SyncRequestListFilter,
  ): Promise<readonly SyncRequest[]>;
  get(id: string): Promise<SyncRequest | null>;
  create(tenantId: string, input: SyncRequestWriteInput): Promise<SyncRequest>;
  update(id: string, input: SyncRequestWriteInput): Promise<SyncRequest | null>;
}
