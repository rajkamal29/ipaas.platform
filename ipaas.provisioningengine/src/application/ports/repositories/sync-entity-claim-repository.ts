import type { Uuid } from "../../../domain/value-objects/uuid.js";
export interface SyncEntityClaimRepository {
  /** Returns committed claims; existing provisioning rows are never reclaimed. */
  claimSubmitted(limit: number): Promise<readonly Uuid[]>;
}
