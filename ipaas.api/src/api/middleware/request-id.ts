import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "x-request-id";

export function requestId(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  const id = randomUUID();
  response.locals["requestId"] = id;
  response.setHeader(REQUEST_ID_HEADER, id);
  next();
}
