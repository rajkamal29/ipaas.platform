import "dotenv/config";
import { createServer } from "node:http";
import pino from "pino";
import { createApp } from "./app";
import { SyncEntityUseCase } from "./application/use-cases/sync-entity.use-case";
import { SyncRequestUseCase } from "./application/use-cases/sync-request.use-case";
import { TenantUseCase } from "./application/use-cases/tenant.use-case";
import { CredentialUseCase } from "./application/use-cases/credential.use-case";
import { CanonicalEntityUseCase } from "./application/use-cases/canonical-entity.use-case";
import { GlobalMappingProfileUseCase } from "./application/use-cases/global-mapping-profile.use-case";
import { MappingProfileUseCase } from "./application/use-cases/mapping-profile.use-case";
import { loadEnvironment } from "./config/env";
import { createPool } from "./infrastructure/postgres/pool";
import { PostgresSyncEntityRepository } from "./infrastructure/postgres/sync-entity.repository";
import { PostgresSyncRequestRepository } from "./infrastructure/postgres/sync-request.repository";
import { PostgresTenantRepository } from "./infrastructure/postgres/tenant.repository";
import { PostgresCredentialRepository } from "./infrastructure/postgres/credential.repository";
import { PostgresCanonicalEntityRepository } from "./infrastructure/postgres/canonical-entity.repository";
import { PostgresGlobalMappingProfileRepository } from "./infrastructure/postgres/global-mapping-profile.repository";
import { PostgresMappingProfileRepository } from "./infrastructure/postgres/mapping-profile.repository";
import { AesGcmCredentialEncryptor } from "./infrastructure/security/aes-gcm-credential-encryptor";

const environment = loadEnvironment();
const logger = pino({
  level: environment.nodeEnv === "production" ? "info" : "debug",
});
const pool = createPool(environment.databaseUrl);
const tenantRepository = new PostgresTenantRepository(pool);
const syncRequestRepository = new PostgresSyncRequestRepository(pool);
const syncEntityRepository = new PostgresSyncEntityRepository(pool);
const credentialRepository = new PostgresCredentialRepository(pool);
const canonicalEntityRepository = new PostgresCanonicalEntityRepository(pool);
const globalMappingRepository = new PostgresGlobalMappingProfileRepository(
  pool,
);
const mappingRepository = new PostgresMappingProfileRepository(pool);
const credentialEncryptor = new AesGcmCredentialEncryptor(
  environment.encryptionMasterKey,
);

const app = createApp({
  tenants: new TenantUseCase(tenantRepository),
  syncRequests: new SyncRequestUseCase(tenantRepository, syncRequestRepository),
  syncEntities: new SyncEntityUseCase(
    tenantRepository,
    syncRequestRepository,
    syncEntityRepository,
  ),
  credentials: new CredentialUseCase(
    tenantRepository,
    credentialRepository,
    credentialEncryptor,
  ),
  canonicalEntities: new CanonicalEntityUseCase(canonicalEntityRepository),
  globalMappings: new GlobalMappingProfileUseCase(globalMappingRepository),
  mappings: new MappingProfileUseCase(
    tenantRepository,
    mappingRepository,
    globalMappingRepository,
  ),
  checkReadiness: async () => {
    await pool.query("SELECT 1");
  },
  logger,
});

const server = createServer(app);
server.listen(environment.port, () => {
  logger.info(
    { port: environment.port, nodeEnv: environment.nodeEnv },
    "API listening",
  );
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");
  server.close(async (serverError) => {
    try {
      await pool.end();
      if (serverError !== undefined) throw serverError;
      process.exitCode = 0;
    } catch (error) {
      logger.error({ error }, "shutdown failed");
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
