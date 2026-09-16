import type {
  CreateMappingProfileInput,
  EffectiveMappingInput,
  MappingProfileFilter,
  MappingProfileKey,
  MappingProfileListInput,
  MappingProfileWriteInput,
} from "../contracts/mapping-profile.contracts";
import { ENTITY_TYPES } from "../../domain/sync-entity/sync-entity";
import { PROVIDERS } from "../../domain/sync-request/sync-request";
import { MAPPING_DIRECTIONS } from "../../domain/mapping-profile/mapping-profile";
import { requireJsonValue } from "./json.validation";
import {
  assertExactKeys,
  optionalSingleValue,
  requireBoolean,
  requireEnum,
  requirePgInteger,
  requireQueryBoolean,
  requireRecord,
} from "./validation";

function key(record: Readonly<Record<string, unknown>>): MappingProfileKey {
  return {
    provider: requireEnum(record["provider"], "provider", PROVIDERS),
    entity: requireEnum(record["entity"], "entity", ENTITY_TYPES),
    direction: requireEnum(
      record["direction"],
      "direction",
      MAPPING_DIRECTIONS,
    ),
  };
}

export function validateCreateMappingProfile(
  value: unknown,
): CreateMappingProfileInput {
  const record = requireRecord(value);
  assertExactKeys(
    record,
    ["provider", "entity", "direction", "version", "fieldMappings"],
    ["isActive"],
  );
  return {
    ...key(record),
    version: requirePgInteger(record["version"], "version"),
    fieldMappings: requireJsonValue(record["fieldMappings"], "fieldMappings"),
    ...(record["isActive"] === undefined
      ? {}
      : { isActive: requireBoolean(record["isActive"], "isActive") }),
  };
}

export function validateUpdateMappingProfile(
  value: unknown,
): MappingProfileWriteInput {
  const record = requireRecord(value);
  assertExactKeys(record, [
    "provider",
    "entity",
    "direction",
    "version",
    "fieldMappings",
    "isActive",
  ]);
  return {
    ...key(record),
    version: requirePgInteger(record["version"], "version"),
    fieldMappings: requireJsonValue(record["fieldMappings"], "fieldMappings"),
    isActive: requireBoolean(record["isActive"], "isActive"),
  };
}

export function validateMappingFilter(
  input: MappingProfileListInput,
): MappingProfileFilter {
  const provider = optionalSingleValue(input.provider, "provider");
  const entity = optionalSingleValue(input.entity, "entity");
  const direction = optionalSingleValue(input.direction, "direction");
  return {
    ...(provider === undefined
      ? {}
      : { provider: requireEnum(provider, "provider", PROVIDERS) }),
    ...(entity === undefined
      ? {}
      : { entity: requireEnum(entity, "entity", ENTITY_TYPES) }),
    ...(direction === undefined
      ? {}
      : { direction: requireEnum(direction, "direction", MAPPING_DIRECTIONS) }),
    ...(input.isActive === undefined
      ? {}
      : { isActive: requireQueryBoolean(input.isActive, "isActive") }),
  };
}

export function validateEffectiveMapping(
  input: EffectiveMappingInput,
): MappingProfileKey {
  return key({
    provider: optionalSingleValue(input.provider, "provider"),
    entity: optionalSingleValue(input.entity, "entity"),
    direction: optionalSingleValue(input.direction, "direction"),
  });
}
