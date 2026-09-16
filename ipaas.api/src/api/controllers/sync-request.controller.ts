import type { NextFunction, Request, Response } from "express";
import type { SyncRequestUseCase } from "../../application/use-cases/sync-request.use-case";
import { createApiResponse } from "../dto/api-response";
import { toSyncRequestResponse } from "../dto/sync-request/sync-request-response.mapper";
import { routeParameter } from "../request/route-parameter";

export class SyncRequestController {
  constructor(private readonly useCase: SyncRequestUseCase) {}

  readonly list = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      const syncRequests = await this.useCase.list(
        routeParameter(request.params["tenantId"]),
        { source: request.query["source"], target: request.query["target"] },
      );
      response
        .status(200)
        .json(createApiResponse(syncRequests.map(toSyncRequestResponse)));
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
      const syncRequest = await this.useCase.get(
        routeParameter(request.params["tenantId"]),
        routeParameter(request.params["requestId"]),
      );
      response
        .status(200)
        .json(createApiResponse(toSyncRequestResponse(syncRequest)));
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
      const syncRequest = await this.useCase.create(
        routeParameter(request.params["tenantId"]),
        { body: request.body as unknown },
      );
      response
        .status(201)
        .json(createApiResponse(toSyncRequestResponse(syncRequest)));
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
      const syncRequest = await this.useCase.update(
        routeParameter(request.params["tenantId"]),
        routeParameter(request.params["requestId"]),
        { body: request.body as unknown },
      );
      response
        .status(200)
        .json(createApiResponse(toSyncRequestResponse(syncRequest)));
    } catch (error) {
      next(error);
    }
  };
}
