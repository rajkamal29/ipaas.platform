import type { JsonValue } from "../../domain/json-value";
import { ValidationError } from "../errors/validation-error";

export function requireJsonValue(
  value: unknown,
  field: string,
  ancestors = new Set<object>(),
): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.includes("\u0000")) throw invalid(field);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw invalid(field);
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value)) throw invalid(field);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  )
    throw invalid(field);
  if (Object.getOwnPropertySymbols(value).length > 0) throw invalid(field);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Array.from({ length: value.length }, (_, index) => {
        if (!Object.hasOwn(value, index)) throw invalid(field);
        return requireJsonValue(value[index], field, ancestors);
      });
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (key.includes("\u0000")) throw invalid(field);
        return [key, requireJsonValue(entry, field, ancestors)];
      }),
    );
  } finally {
    ancestors.delete(value);
  }
}

function invalid(field: string): ValidationError {
  return new ValidationError("Invalid request payload.", [
    { field, code: "type", message: "Expected a serializable JSON value." },
  ]);
}
