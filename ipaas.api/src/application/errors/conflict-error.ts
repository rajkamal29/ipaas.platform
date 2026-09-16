import { ApplicationError } from "./application-error";

export class ConflictError extends ApplicationError {
  readonly code = "conflict";
}
