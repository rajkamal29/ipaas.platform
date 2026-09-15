import { DomainValidationError } from "../errors/domain-error.js";
export type Uuid = string & { readonly __uuid: unique symbol };
export function uuid(value: string): Uuid {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new DomainValidationError("id");
  return value.toLowerCase() as Uuid;
}
