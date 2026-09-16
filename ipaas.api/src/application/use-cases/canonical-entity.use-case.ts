import type {
  CanonicalEntityListFilter,
  CanonicalEntityListInput,
  CanonicalEntityOutput,
} from "../contracts/canonical-entity.contracts";
import { NotFoundError } from "../errors/not-found-error";
import { toCanonicalEntityOutput } from "../mappers/canonical-entity-output.mapper";
import type { CanonicalEntityRepository } from "../ports/canonical-entity.repository";
import { ENTITY_TYPES } from "../../domain/sync-entity/sync-entity";
import {
  optionalSingleValue,
  requireEnum,
  requirePgInteger,
  requireUuid,
} from "../validation/validation";

export class CanonicalEntityUseCase {
  constructor(private readonly canonicalEntities: CanonicalEntityRepository) {}

  async list(
    input: CanonicalEntityListInput,
  ): Promise<readonly CanonicalEntityOutput[]> {
    const name = optionalSingleValue(input.name, "name");
    const version = optionalSingleValue(input.version, "version");
    const filter: CanonicalEntityListFilter = {
      ...(name === undefined
        ? {}
        : { name: requireEnum(name, "name", ENTITY_TYPES) }),
      ...(version === undefined
        ? {}
        : { version: requirePgInteger(version, "version") }),
    };
    return (await this.canonicalEntities.list(filter)).map(
      toCanonicalEntityOutput,
    );
  }

  async get(id: string): Promise<CanonicalEntityOutput> {
    const entity = await this.canonicalEntities.get(
      requireUuid(id, "canonicalEntityId"),
    );
    if (entity === null) throw new NotFoundError();
    return toCanonicalEntityOutput(entity);
  }
}
