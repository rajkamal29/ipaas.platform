import { resolve } from "node:path";
import { loadConfig } from "../config/environment.js";
import { createDatabasePool } from "../infrastructure/postgres/postgres-client.js";
import { runPostgresMigrations } from "../infrastructure/postgres/postgres-migration-runner.js";
import { Logger } from "../logging/logger.js";

const config = loadConfig();
const logger = new Logger(config.logLevel);

if (config.databaseUrl === undefined || config.databaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required to initialize the PostgreSQL schema.");
}

const migrationsDirectory = resolve(process.cwd(), "database", "init");
const pool = createDatabasePool(config.databaseUrl);

try {
  await runPostgresMigrations(pool, migrationsDirectory, logger);
} catch (error: unknown) {
  logger.error("PostgreSQL initialization failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
} finally {
  await pool.end();
}

