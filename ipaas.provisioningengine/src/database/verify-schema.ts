import { loadConfig } from "../config/environment.js";
import { createDatabasePool } from "../infrastructure/postgres/postgres-client.js";
import { verifyPlatformSchema } from "../infrastructure/postgres/platform-schema-verifier.js";
import { Logger } from "../logging/logger.js";

const config = loadConfig();
const logger = new Logger(config.logLevel);

if (config.databaseUrl === undefined || config.databaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required to verify the shared IPAAS Platform schema.");
}

const pool = createDatabasePool(config.databaseUrl);

try {
  await verifyPlatformSchema(pool, logger);
} catch (error: unknown) {
  logger.error("Shared IPAAS Platform database schema verification failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
} finally {
  await pool.end();
}
