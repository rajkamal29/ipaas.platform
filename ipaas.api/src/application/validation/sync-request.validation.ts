import type { SyncRequestWriteInput } from "../contracts/sync-request.contracts";
import { PROVIDERS } from "../../domain/sync-request/sync-request";
import { assertExactKeys, requireEnum, requireRecord } from "./validation";

export function validateSyncRequestInput(
  value: unknown,
): SyncRequestWriteInput {
  const record = requireRecord(value);
  assertExactKeys(record, ["source", "target"]);
  return {
    source: requireEnum(record["source"], "source", PROVIDERS),
    target: requireEnum(record["target"], "target", PROVIDERS),
  };
}
