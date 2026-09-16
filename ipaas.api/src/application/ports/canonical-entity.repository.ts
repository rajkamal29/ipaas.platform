import type { CanonicalEntityListFilter } from "../contracts/canonical-entity.contracts";
import type { CanonicalEntity } from "../../domain/canonical-entity/canonical-entity";

export interface CanonicalEntityRepository {
  list(filter: CanonicalEntityListFilter): Promise<readonly CanonicalEntity[]>;
  get(id: string): Promise<CanonicalEntity | null>;
}
