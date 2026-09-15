import { composeApplication } from "./bootstrap.js";
import { ConfigurationError, loadConfig } from "./config/environment.js";
import { Logger } from "./infrastructure/logging/logger.js";
import { ApplicationError } from "./application/errors/provisioning-errors.js";

const startupLogger = new Logger("info");
let application: Awaited<ReturnType<typeof composeApplication>> | undefined;
let stopping = false;
const stop = (): void => {
  stopping = true;
  if (application)
    void application.shutdown().catch(() => {
      startupLogger.error("Shutdown failed");
      process.exitCode = 1;
    });
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  const config = loadConfig();
  application = await composeApplication(config);
  if (!stopping) {
    application.worker.start();
    if (config.syncEntityId)
      await application.worker.submit(config.syncEntityId);
    else
      application.logger.info(
        "No explicit entity supplied; polling is not implemented in issue #18",
      );
  }
} catch (error: unknown) {
  startupLogger.error(
    error instanceof ConfigurationError
      ? error.message
      : "Provisioning Engine stopped with an error",
    {
      failureCode:
        error instanceof ApplicationError
          ? error.code
          : "startup-or-shutdown-failure",
    },
  );
  process.exitCode = 1;
} finally {
  try {
    await application?.shutdown();
  } catch {
    startupLogger.error("Database shutdown failed");
    process.exitCode = 1;
  }
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
