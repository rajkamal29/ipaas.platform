import type { NextFunction, Request, Response } from "express";
import { NotFoundError } from "../../application/errors/not-found-error";

export function notFound(
  _request: Request,
  _response: Response,
  next: NextFunction,
): void {
  next(new NotFoundError());
}
