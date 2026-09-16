import type { CredentialOutput } from "../contracts/credential.contracts";
import type { Credential } from "../../domain/credential/credential";

export function toCredentialOutput(value: Credential): CredentialOutput {
  return { ...value, state: "configured" };
}
