import type { ErrorRequestHandler } from "express";
import {
  ApplicationError,
  type ApplicationErrorCode,
} from "../../application/errors/application-error";
import type { Logger } from "../../shared/logger";

interface ExpressJsonError extends SyntaxError {
  readonly status?: number;
}

const applicationErrorStatuses: Readonly<Record<ApplicationErrorCode, number>> =
  {
    validation: 422,
    "not-found": 404,
    conflict: 409,
  };

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _request, response, _next) => {
    const requestId = String(response.locals["requestId"]);
    if (error instanceof ApplicationError) {
      response.status(applicationErrorStatuses[error.code]).json({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId,
        },
      });
      return;
    }
    const parseError = error as ExpressJsonError;
    if (error instanceof SyntaxError && parseError.status === 400) {
      response.status(400).json({
        error: {
          code: "malformed-json",
          message: "The request body is not valid JSON.",
          details: [],
          requestId,
        },
      });
      return;
    }
    if (parseError.status === 413) {
      response.status(413).json({
        error: {
          code: "payload-too-large",
          message: "The request body is too large.",
          details: [],
          requestId,
        },
      });
      return;
    }
    logger.error(
      {
        requestId,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { value: String(error) },
      },
      "unexpected request failure",
    );
    response.status(500).json({
      error: {
        code: "internal",
        message: "An unexpected error occurred.",
        details: [],
        requestId,
      },
    });
  };
}
