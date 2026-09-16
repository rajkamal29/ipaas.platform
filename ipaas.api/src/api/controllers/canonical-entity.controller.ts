import type { NextFunction, Request, Response } from "express";
import type { CanonicalEntityUseCase } from "../../application/use-cases/canonical-entity.use-case";
import { createApiResponse } from "../dto/api-response";
import { toCanonicalEntityResponse } from "../dto/canonical-entity/canonical-entity-response.mapper";
import { routeParameter } from "../request/route-parameter";

export class CanonicalEntityController {
  constructor(private readonly useCase: CanonicalEntityUseCase) {}

  readonly list = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      const rows = await this.useCase.list({
        name: request.query["name"],
        version: request.query["version"],
      });
      response
        .status(200)
        .json(createApiResponse(rows.map(toCanonicalEntityResponse)));
    } catch (error) {
      next(error);
    }
  };

  readonly get = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      const row = await this.useCase.get(
        routeParameter(request.params["canonicalEntityId"]),
      );
      response
        .status(200)
        .json(createApiResponse(toCanonicalEntityResponse(row)));
    } catch (error) {
      next(error);
    }
  };
}
