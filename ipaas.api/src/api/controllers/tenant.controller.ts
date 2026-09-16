import type { NextFunction, Request, Response } from "express";
import type { TenantUseCase } from "../../application/use-cases/tenant.use-case";
import { createApiResponse } from "../dto/api-response";
import { toTenantResponse } from "../dto/tenant/tenant-response.mapper";
import { routeParameter } from "../request/route-parameter";

export class TenantController {
  constructor(private readonly useCase: TenantUseCase) {}

  readonly list = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      const tenants = await this.useCase.list({ name: request.query["name"] });
      response
        .status(200)
        .json(createApiResponse(tenants.map(toTenantResponse)));
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
      const tenant = await this.useCase.get(
        routeParameter(request.params["tenantId"]),
      );
      response.status(200).json(createApiResponse(toTenantResponse(tenant)));
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
      const body: unknown = request.body;
      const tenant = await this.useCase.create({ body });
      response.status(201).json(createApiResponse(toTenantResponse(tenant)));
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
      const tenant = await this.useCase.update(
        routeParameter(request.params["tenantId"]),
        { body: request.body as unknown },
      );
      response.status(200).json(createApiResponse(toTenantResponse(tenant)));
    } catch (error) {
      next(error);
    }
  };
}
