import type { NextFunction, Request, Response } from "express";
import type { GlobalMappingProfileUseCase } from "../../application/use-cases/global-mapping-profile.use-case";
import { createApiResponse } from "../dto/api-response";
import { toMappingProfileResponse } from "../dto/mapping-profile/mapping-profile-response.mapper";
import { routeParameter } from "../request/route-parameter";

export class GlobalMappingProfileController {
  constructor(private readonly useCase: GlobalMappingProfileUseCase) {}

  readonly list = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      const rows = await this.useCase.list({
        provider: request.query["provider"],
        entity: request.query["entity"],
        direction: request.query["direction"],
        isActive: request.query["isActive"],
      });
      response
        .status(200)
        .json(createApiResponse(rows.map(toMappingProfileResponse)));
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
        routeParameter(request.params["profileId"]),
      );
      response
        .status(200)
        .json(createApiResponse(toMappingProfileResponse(row)));
    } catch (error) {
      next(error);
    }
  };

  readonly create = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      const row = await this.useCase.create({ body: request.body as unknown });
      response
        .status(201)
        .json(createApiResponse(toMappingProfileResponse(row)));
    } catch (error) {
      next(error);
    }
  };

  readonly update = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      const row = await this.useCase.update(
        routeParameter(request.params["profileId"]),
        {
          body: request.body as unknown,
        },
      );
      response
        .status(200)
        .json(createApiResponse(toMappingProfileResponse(row)));
    } catch (error) {
      next(error);
    }
  };

  readonly activate = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      const row = await this.useCase.activate(
        routeParameter(request.params["profileId"]),
      );
      response
        .status(200)
        .json(createApiResponse(toMappingProfileResponse(row)));
    } catch (error) {
      next(error);
    }
  };
}
