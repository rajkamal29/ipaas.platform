import type { ErrorDetail } from "../errors/application-error";
import { ValidationError } from "../errors/validation-error";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_INTERVAL_SECONDS = 2_147_483_647;

export function requireRecord(
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Expected a JSON object.", [
      { field: "", code: "type", message: "Expected a JSON object." },
    ]);
  }
  return value as Readonly<Record<string, unknown>>;
}

export function assertExactKeys(
  record: Readonly<Record<string, unknown>>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  const details: ErrorDetail[] = required
    .filter((key) => !Object.hasOwn(record, key))
    .map((field) => ({
      field,
      code: "required" as const,
      message: "This field is required.",
    }));
  details.push(
    ...Object.keys(record)
      .filter((key) => !allowed.has(key))
      .map((field) => ({
        field,
        code: "unknown" as const,
        message: "Unknown field.",
      })),
  );
  if (details.length > 0)
    throw new ValidationError("Invalid request payload.", details);
}

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ValidationError("Invalid identifier.", [
      { field, code: "value", message: "Expected a UUID string." },
    ]);
  }
  return value.toLowerCase();
}

export function optionalSingleValue(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ValidationError("Invalid query.", [
      { field, code: "type", message: "Expected one string value." },
    ]);
  }
  return value;
}

export function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.includes("\u0000")) {
    throw new ValidationError("Invalid request payload.", [
      { field, code: "value", message: "Expected PostgreSQL-compatible text." },
    ]);
  }
  return value;
}

export function requireEnum<const T extends string>(
  value: unknown,
  field: string,
  values: readonly T[],
): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new ValidationError("Invalid request payload.", [
      { field, code: "value", message: "Unsupported value." },
    ]);
  }
  return value as T;
}
