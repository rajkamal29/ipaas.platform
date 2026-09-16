import type { TenantWriteInput } from "../contracts/tenant.contracts";
import { assertExactKeys, requireRecord, requireText } from "./validation";

export function validateTenantInput(value: unknown): TenantWriteInput {
  const record = requireRecord(value);
  assertExactKeys(record, ["name"]);
  return { name: requireText(record["name"], "name") };
}
