import { ApplicationError } from "./application-error";

export class NotFoundError extends ApplicationError {
  readonly code = "not-found";

  constructor(message = "The requested resource was not found.") {
    super(message);
  }
}
