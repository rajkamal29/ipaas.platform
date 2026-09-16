import express, { type Express } from "express";
import { SyncEntityController } from "./api/controllers/sync-entity.controller";
import { SyncRequestController } from "./api/controllers/sync-request.controller";
import { TenantController } from "./api/controllers/tenant.controller";
import { CredentialController } from "./api/controllers/credential.controller";
import { CanonicalEntityController } from "./api/controllers/canonical-entity.controller";
import { GlobalMappingProfileController } from "./api/controllers/global-mapping-profile.controller";
import { MappingProfileController } from "./api/controllers/mapping-profile.controller";
import { errorHandler } from "./api/middleware/error-handler";
import { notFound } from "./api/middleware/not-found";
import { requestId } from "./api/middleware/request-id";
import { healthRoutes } from "./api/routes/health.routes";
import { syncEntityRoutes } from "./api/routes/sync-entity.routes";
import { syncRequestRoutes } from "./api/routes/sync-request.routes";
import { tenantRoutes } from "./api/routes/tenant.routes";
import { credentialRoutes } from "./api/routes/credential.routes";
import { canonicalEntityRoutes } from "./api/routes/canonical-entity.routes";
import { globalMappingProfileRoutes } from "./api/routes/global-mapping-profile.routes";
import { mappingProfileRoutes } from "./api/routes/mapping-profile.routes";
import type { CredentialUseCase } from "./application/use-cases/credential.use-case";
import type { CanonicalEntityUseCase } from "./application/use-cases/canonical-entity.use-case";
import type { GlobalMappingProfileUseCase } from "./application/use-cases/global-mapping-profile.use-case";
import type { MappingProfileUseCase } from "./application/use-cases/mapping-profile.use-case";
import type { SyncEntityUseCase } from "./application/use-cases/sync-entity.use-case";
import type { SyncRequestUseCase } from "./application/use-cases/sync-request.use-case";
import type { TenantUseCase } from "./application/use-cases/tenant.use-case";
import type { Logger } from "./shared/logger";

export interface ApplicationDependencies {
  readonly tenants: TenantUseCase;
  readonly syncRequests: SyncRequestUseCase;
  readonly syncEntities: SyncEntityUseCase;
  readonly credentials?: CredentialUseCase;
  readonly canonicalEntities?: CanonicalEntityUseCase;
  readonly globalMappings?: GlobalMappingProfileUseCase;
  readonly mappings?: MappingProfileUseCase;
  readonly checkReadiness: () => Promise<void>;
  readonly logger: Logger;
}

export function createApp(dependencies: ApplicationDependencies): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestId);
  app.use(express.json({ limit: "100kb" }));
  app.use(healthRoutes(dependencies.checkReadiness));
  if (dependencies.canonicalEntities !== undefined) {
    app.use(
      "/api/canonical-entities",
      canonicalEntityRoutes(
        new CanonicalEntityController(dependencies.canonicalEntities),
      ),
    );
  }
  if (dependencies.globalMappings !== undefined) {
    app.use(
      "/api/global-mapping-profiles",
      globalMappingProfileRoutes(
        new GlobalMappingProfileController(dependencies.globalMappings),
      ),
    );
  }
  if (dependencies.credentials !== undefined) {
    app.use(
      "/api/tenants/:tenantId/credentials",
      credentialRoutes(new CredentialController(dependencies.credentials)),
    );
  }
  if (dependencies.mappings !== undefined) {
    app.use(
      "/api/tenants/:tenantId/mapping-profiles",
      mappingProfileRoutes(new MappingProfileController(dependencies.mappings)),
    );
  }
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
