import { PostgresSyncEntityClaimRepository } from "./infrastructure/persistence/postgres/repositories/postgres-sync-entity-claim-repository.js";
import { loadConfig } from "./config/environment.js";
import { Logger } from "./infrastructure/logging/logger.js";
import { createDatabasePool } from "./infrastructure/persistence/postgres/postgres-client.js";
import { verifyPlatformSchema } from "./infrastructure/persistence/postgres/platform-schema-verifier.js";
import { PostgresSyncEntityRepository } from "./infrastructure/persistence/postgres/repositories/postgres-sync-entity-repository.js";
import { PostgresSyncRequestRepository } from "./infrastructure/persistence/postgres/repositories/postgres-sync-request-repository.js";
import { ConfigurationRuntimeImageResolver } from "./infrastructure/runtime-images/configuration-runtime-image-resolver.js";
import { createDockerClient } from "./infrastructure/runtime/docker/docker-client.js";
import { DockerContainerProvisioner } from "./infrastructure/runtime/docker/docker-container-provisioner.js";
import { GitHubActionsDeploymentTrigger } from "./infrastructure/runtime/github/github-actions-deployment-trigger.js";
import { ProvisionSyncEntityUseCase } from "./application/use-cases/provision-sync-entity.js";
import { ProvisioningWorker } from "./workers/provisioning-worker.js";

export async function composeApplication(config = loadConfig()) {
  const logger = new Logger(config.logLevel);
  const pool = createDatabasePool(config.databaseUrl);
  pool.on("error", () => logger.error("Idle database connection failed"));
  try {
    const runtime =
      config.runtime.kind === "docker"
        ? new DockerContainerProvisioner(
            createDockerClient(config.runtime.options),
            config.runtimeEnvironment,
            config.runtime.options.network,
          )
        : new GitHubActionsDeploymentTrigger(config.runtime.options, fetch);
    const provisioning = new ProvisionSyncEntityUseCase(
      new PostgresSyncEntityRepository(pool),
      new PostgresSyncRequestRepository(pool),
      new ConfigurationRuntimeImageResolver(
        config.runtimeImageMappings,
        config.expectedRuntimeImage,
      ),
      runtime,
      logger,
    );
    await verifyPlatformSchema(pool, logger);
    logProvisioningStartup(logger, config);
    const worker = new ProvisioningWorker(provisioning, {
      claims: new PostgresSyncEntityClaimRepository(pool),
      options: config.polling,
      logger,
    });
    let shutdownPromise: Promise<void> | undefined;
    return {
      logger,
      worker,
      provisioning,
      shutdown(): Promise<void> {
        shutdownPromise ??= (async () => {
          try {
            await worker.stop();
          } finally {
            await pool.end();
          }
        })();
        return shutdownPromise;
      },
    };
  } catch {
    await pool.end();
    throw new Error(
      "Provisioning Engine startup failed. Check configuration, connectivity, and shared schema.",
    );
  }
}

export function logProvisioningStartup(
  logger: Pick<Logger, "info">,
  config: ReturnType<typeof loadConfig>,
): void {
  logger.info("Provisioning Engine started", {
    runtimeProvider: config.runtime.kind,
    pollIntervalMs: config.polling.intervalMs,
    batchSize: config.polling.batchSize,
    maxConcurrency: config.polling.maxConcurrency,
  });
}
