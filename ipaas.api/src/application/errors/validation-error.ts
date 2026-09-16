import { ApplicationError, type ErrorDetail } from "./application-error";

export class ValidationError extends ApplicationError {
  readonly code = "validation";

  constructor(message: string, details: readonly ErrorDetail[] = []) {
    super(message, details);
  }
}
