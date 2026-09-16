import type { ConfigureCredentialsInput } from "../contracts/credential.contracts";
import { PROVIDERS } from "../../domain/sync-request/sync-request";
import {
  assertExactKeys,
  requireEnum,
  requireRecord,
  requireText,
} from "./validation";

export function validateConfigureCredentials(
  value: unknown,
): ConfigureCredentialsInput {
  const record = requireRecord(value);
  assertExactKeys(record, ["source", "sourceSecret", "target", "targetSecret"]);
  return {
    source: requireEnum(record["source"], "source", PROVIDERS),
    sourceSecret: requireText(record["sourceSecret"], "sourceSecret"),
    target: requireEnum(record["target"], "target", PROVIDERS),
    targetSecret: requireText(record["targetSecret"], "targetSecret"),
  };
}
