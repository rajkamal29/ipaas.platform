import { ConflictError } from "../../application/errors/conflict-error";
import { ValidationError } from "../../application/errors/validation-error";

interface DatabaseErrorLike {
  readonly code?: unknown;
  readonly constraint?: unknown;
}

const conflictConstraints: Readonly<Record<string, string>> = {
  tenants_name_key: "A tenant with this exact name already exists.",
  sync_entities_request_entity_unique:
    "This entity is already configured for the sync request.",
  mapping_profiles_one_active_idx:
    "An active tenant mapping profile already exists for this scope.",
  global_mapping_profiles_one_active_idx:
    "An active global mapping profile already exists for this scope.",
};

export function translatePostgresError(error: unknown): never {
  const candidate = error as DatabaseErrorLike;
  const constraint =
    typeof candidate.constraint === "string" ? candidate.constraint : undefined;
  if (candidate.code === "23505") {
    const knownMessage =
      constraint === undefined ? undefined : conflictConstraints[constraint];
    throw new ConflictError(
      knownMessage ?? "A record with the same unique key already exists.",
    );
  }
  if (
    candidate.code === "23503" ||
    candidate.code === "23514" ||
    candidate.code === "23502" ||
    candidate.code === "22P02"
  ) {
    throw new ValidationError("The request violates a persistence constraint.");
  }
  throw error;
}

export async function withPostgresErrors<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return translatePostgresError(error);
  }
}
