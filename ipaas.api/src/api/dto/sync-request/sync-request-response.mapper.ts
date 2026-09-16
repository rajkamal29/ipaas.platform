import type { SyncRequestOutput } from "../../../application/contracts/sync-request.contracts";
import type { SyncRequestResponseDto } from "./sync-request-response.dto";

export function toSyncRequestResponse(
  syncRequest: SyncRequestOutput,
): SyncRequestResponseDto {
  return {
    id: syncRequest.id,
    tenantId: syncRequest.tenantId,
    source: syncRequest.source,
    target: syncRequest.target,
    createdAt: syncRequest.createdAt,
  };
}
