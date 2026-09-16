export interface ErrorDetail {
  readonly field: string;
  readonly code:
    "required" | "type" | "value" | "range" | "foreign-key" | "unknown";
  readonly message: string;
}

export type ApplicationErrorCode = "validation" | "not-found" | "conflict";

export abstract class ApplicationError extends Error {
  abstract readonly code: ApplicationErrorCode;

  constructor(
    message: string,
    readonly details: readonly ErrorDetail[] = [],
  ) {
    super(message);
    this.name = new.target.name;
  }
}
