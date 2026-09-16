import type { CanonicalEntityOutput } from "../../../application/contracts/canonical-entity.contracts";
import type { CanonicalEntityResponseDto } from "./canonical-entity-response.dto";

export function toCanonicalEntityResponse(
  value: CanonicalEntityOutput,
): CanonicalEntityResponseDto {
  return { ...value };
}
