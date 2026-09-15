export class DomainValidationError extends Error {
  override readonly name = "DomainValidationError";
  constructor(readonly field: string) {
    super(`Invalid domain value for ${field}.`);
  }
}
