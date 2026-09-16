import type { CredentialViewOutput } from "../../../application/contracts/credential.contracts";
import type { CredentialViewResponseDto } from "./credential-response.dto";

export function toCredentialResponse(
  value: CredentialViewOutput,
): CredentialViewResponseDto {
  return { ...value };
}
