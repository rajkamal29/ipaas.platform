import type {
  CreateSyncEntityInput,
  UpdateSyncEntityInput,
} from "../contracts/sync-entity.contracts";
import type { SyncEntity } from "../../domain/sync-entity/sync-entity";

export interface SyncEntityRepository {
  list(syncRequestId: string): Promise<readonly SyncEntity[]>;
  get(id: string): Promise<SyncEntity | null>;
  create(
    syncRequestId: string,
    input: CreateSyncEntityInput,
  ): Promise<SyncEntity>;
  update(id: string, input: UpdateSyncEntityInput): Promise<SyncEntity | null>;
}
