import express, { type Express } from "express";
import { SyncEntityController } from "./api/controllers/sync-entity.controller";
import { SyncRequestController } from "./api/controllers/sync-request.controller";
import { TenantController } from "./api/controllers/tenant.controller";
import { errorHandler } from "./api/middleware/error-handler";
import { notFound } from "./api/middleware/not-found";
import { requestId } from "./api/middleware/request-id";
import { healthRoutes } from "./api/routes/health.routes";
import { syncEntityRoutes } from "./api/routes/sync-entity.routes";
import { syncRequestRoutes } from "./api/routes/sync-request.routes";
import { tenantRoutes } from "./api/routes/tenant.routes";
import type { SyncEntityUseCase } from "./application/use-cases/sync-entity.use-case";
import type { SyncRequestUseCase } from "./application/use-cases/sync-request.use-case";
import type { TenantUseCase } from "./application/use-cases/tenant.use-case";
import type { Logger } from "./shared/logger";

export interface ApplicationDependencies {
  readonly tenants: TenantUseCase;
  readonly syncRequests: SyncRequestUseCase;
  readonly syncEntities: SyncEntityUseCase;
  readonly checkReadiness: () => Promise<void>;
  readonly logger: Logger;
}

export function createApp(dependencies: ApplicationDependencies): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestId);
  app.use(express.json({ limit: "100kb" }));
  app.use(healthRoutes(dependencies.checkReadiness));
  app.use(
    "/api/tenants/:tenantId/sync-requests/:requestId/entities",
    syncEntityRoutes(new SyncEntityController(dependencies.syncEntities)),
  );
  app.use(
    "/api/tenants/:tenantId/sync-requests",
    syncRequestRoutes(new SyncRequestController(dependencies.syncRequests)),
  );
  app.use(
    "/api/tenants",
    tenantRoutes(new TenantController(dependencies.tenants)),
  );
  app.use(notFound);
  app.use(errorHandler(dependencies.logger));
  return app;
}
