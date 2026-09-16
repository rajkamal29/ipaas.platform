import type { CanonicalEntityOutput } from "../contracts/canonical-entity.contracts";
import type { CanonicalEntity } from "../../domain/canonical-entity/canonical-entity";

export function toCanonicalEntityOutput(
  value: CanonicalEntity,
): CanonicalEntityOutput {
  return { ...value };
}
