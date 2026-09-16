import type { SyncRequestOutput } from "../contracts/sync-request.contracts";
import type { SyncRequest } from "../../domain/sync-request/sync-request";

export function toSyncRequestOutput(
  syncRequest: SyncRequest,
): SyncRequestOutput {
  return {
    id: syncRequest.id,
    tenantId: syncRequest.tenantId,
    source: syncRequest.source,
    target: syncRequest.target,
    createdAt: syncRequest.createdAt,
  };
}
