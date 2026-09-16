import type { NextFunction, Request, Response } from "express";
import type { MappingProfileUseCase } from "../../application/use-cases/mapping-profile.use-case";
import { createApiResponse } from "../dto/api-response";
import {
  toEffectiveMappingResponse,
  toTenantMappingProfileResponse,
} from "../dto/mapping-profile/mapping-profile-response.mapper";
import { routeParameter } from "../request/route-parameter";

export class MappingProfileController {
  constructor(private readonly useCase: MappingProfileUseCase) {}

  private tenantId(request: Request): string {
    return routeParameter(request.params["tenantId"]);
  }

  readonly list = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      const rows = await this.useCase.list(this.tenantId(request), {
        provider: request.query["provider"],
        entity: request.query["entity"],
        direction: request.query["direction"],
        isActive: request.query["isActive"],
      });
      response
        .status(200)
        .json(createApiResponse(rows.map(toTenantMappingProfileResponse)));
    } catch (error) {
      next(error);
    }
  };

  readonly effective = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.useCase.resolveEffective(
        this.tenantId(request),
        {
          provider: request.query["provider"],
          entity: request.query["entity"],
          direction: request.query["direction"],
        },
      );
      response
        .status(200)
        .json(createApiResponse(toEffectiveMappingResponse(result)));
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
        this.tenantId(request),
        routeParameter(request.params["profileId"]),
      );
      response
        .status(200)
        .json(createApiResponse(toTenantMappingProfileResponse(row)));
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
      const row = await this.useCase.create(this.tenantId(request), {
        body: request.body as unknown,
      });
      response
        .status(201)
        .json(createApiResponse(toTenantMappingProfileResponse(row)));
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
        this.tenantId(request),
        routeParameter(request.params["profileId"]),
        { body: request.body as unknown },
      );
      response
        .status(200)
        .json(createApiResponse(toTenantMappingProfileResponse(row)));
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
        this.tenantId(request),
        routeParameter(request.params["profileId"]),
      );
      response
        .status(200)
        .json(createApiResponse(toTenantMappingProfileResponse(row)));
    } catch (error) {
      next(error);
    }
  };
}
