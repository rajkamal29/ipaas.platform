import "dotenv/config";
import { createServer } from "node:http";
import pino from "pino";
import { createApp } from "./app";
import { SyncEntityUseCase } from "./application/use-cases/sync-entity.use-case";
import { SyncRequestUseCase } from "./application/use-cases/sync-request.use-case";
import { SyncStateUseCase } from "./application/use-cases/sync-state.use-case";
import { TenantUseCase } from "./application/use-cases/tenant.use-case";
import { loadEnvironment } from "./config/env";
import { createPool } from "./infrastructure/postgres/pool";
import { PostgresSyncEntityRepository } from "./infrastructure/postgres/sync-entity.repository";
import { PostgresSyncRequestRepository } from "./infrastructure/postgres/sync-request.repository";
import { PostgresSyncStateRepository } from "./infrastructure/postgres/sync-state.repository";
import { PostgresTenantRepository } from "./infrastructure/postgres/tenant.repository";

const environment = loadEnvironment();
const logger = pino({
  level: environment.nodeEnv === "production" ? "info" : "debug",
});
const pool = createPool(environment.databaseUrl);
const tenantRepository = new PostgresTenantRepository(pool);
const syncRequestRepository = new PostgresSyncRequestRepository(pool);
const syncEntityRepository = new PostgresSyncEntityRepository(pool);
const syncStateUseCase = new SyncStateUseCase(
  new PostgresSyncStateRepository(pool),
);

const app = createApp({
  tenants: new TenantUseCase(tenantRepository),
  syncRequests: new SyncRequestUseCase(tenantRepository, syncRequestRepository),
  syncEntities: new SyncEntityUseCase(
    tenantRepository,
    syncRequestRepository,
    syncEntityRepository,
    syncStateUseCase,
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
