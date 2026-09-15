import { loadDatabaseConfig } from "../config/environment.js";
import { createDatabasePool } from "../infrastructure/persistence/postgres/postgres-client.js";
import { verifyPlatformSchema } from "../infrastructure/persistence/postgres/platform-schema-verifier.js";
import { Logger } from "../infrastructure/logging/logger.js";

const logger = new Logger("info");
try {
  const config = loadDatabaseConfig();
  const pool = createDatabasePool(config.databaseUrl);
  pool.on("error", () => logger.error("Idle database connection failed"));
  try {
    await verifyPlatformSchema(pool, logger);
  } finally {
    await pool.end();
  }
} catch {
  logger.error(
    "Shared schema verification failed. Check DATABASE_URL and run platform migrations from ipaas.infra.",
  );
  process.exitCode = 1;
}
