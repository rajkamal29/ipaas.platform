import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool } from "pg";
import type { Logger } from "../../logging/logger.js";

export async function runPostgresMigrations(
  pool: Pool,
  migrationsDirectory: string,
  logger: Logger,
): Promise<void> {
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  if (migrationFiles.length === 0) {
    throw new Error(`No SQL files found in ${migrationsDirectory}.`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const migrationFile of migrationFiles) {
      const sql = await readFile(resolve(migrationsDirectory, migrationFile), "utf8");
      logger.info("Applying PostgreSQL initialization file", { migrationFile });
      await client.query(sql);
    }

    await client.query("COMMIT");
    logger.info("PostgreSQL schema and sample data initialized", {
      migrationCount: migrationFiles.length,
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
