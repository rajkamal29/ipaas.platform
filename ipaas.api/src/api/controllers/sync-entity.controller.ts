import type { NextFunction, Request, Response } from "express";
import type { SyncEntityUseCase } from "../../application/use-cases/sync-entity.use-case";
import { createApiResponse } from "../dto/api-response";
import {
  toSyncEntityReadResponse,
  toSyncEntityResponse,
} from "../dto/sync-entity/sync-entity-response.mapper";
import { routeParameter } from "../request/route-parameter";

export class SyncEntityController {
  constructor(private readonly useCase: SyncEntityUseCase) {}

  readonly list = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      const syncEntities = await this.useCase.list(
        routeParameter(request.params["tenantId"]),
        routeParameter(request.params["requestId"]),
      );
      response
        .status(200)
        .json(createApiResponse(syncEntities.map(toSyncEntityReadResponse)));
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
      const syncEntity = await this.useCase.get(
        routeParameter(request.params["tenantId"]),
        routeParameter(request.params["requestId"]),
        routeParameter(request.params["entityId"]),
      );
      response
        .status(200)
        .json(createApiResponse(toSyncEntityReadResponse(syncEntity)));
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
      const syncEntity = await this.useCase.create(
        routeParameter(request.params["tenantId"]),
        routeParameter(request.params["requestId"]),
        { body: request.body as unknown },
      );
      response
        .status(201)
        .json(createApiResponse(toSyncEntityResponse(syncEntity)));
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
      const syncEntity = await this.useCase.update(
        routeParameter(request.params["tenantId"]),
        routeParameter(request.params["requestId"]),
        routeParameter(request.params["entityId"]),
        { body: request.body as unknown },
      );
      response
        .status(200)
        .json(createApiResponse(toSyncEntityResponse(syncEntity)));
    } catch (error) {
      next(error);
    }
  };
}
