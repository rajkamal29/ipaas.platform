import type { NextFunction, Request, Response } from "express";
import type { CredentialUseCase } from "../../application/use-cases/credential.use-case";
import { createApiResponse } from "../dto/api-response";
import { toCredentialResponse } from "../dto/credential/credential-response.mapper";
import { routeParameter } from "../request/route-parameter";

export class CredentialController {
  constructor(private readonly useCase: CredentialUseCase) {}

  readonly list = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      const rows = await this.useCase.list(
        routeParameter(request.params["tenantId"]),
      );
      response
        .status(200)
        .json(createApiResponse(rows.map(toCredentialResponse)));
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
        routeParameter(request.params["tenantId"]),
        routeParameter(request.params["provider"]),
      );
      response.status(200).json(createApiResponse(toCredentialResponse(row)));
    } catch (error) {
      next(error);
    }
  };

  readonly configure = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      const rows = await this.useCase.configure(
        routeParameter(request.params["tenantId"]),
        {
          body: request.body as unknown,
        },
      );
      response
        .status(201)
        .json(createApiResponse(rows.map(toCredentialResponse)));
    } catch (error) {
      next(error);
    }
  };
}
