import { ProvisioningService } from "./application/provisioning-service.js";
import { loadConfig } from "./config/environment.js";
import { createDockerClient } from "./infrastructure/docker/docker-client.js";
import { DockerContainerProvisioner } from "./infrastructure/docker/docker-container-provisioner.js";
import { GitHubActionsDeploymentTrigger } from "./infrastructure/github/github-actions-deployment-trigger.js";
import { ConfigurationRuntimeImageResolver } from "./infrastructure/runtime-images/configuration-runtime-image-resolver.js";
import { Logger } from "./logging/logger.js";
import { ProvisioningWorker } from "./workers/provisioning-worker.js";

export interface Application {
  logger: Logger;
  worker: ProvisioningWorker;
  provisioningService: ProvisioningService;
}

export function composeApplication(): Application {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);
  const imageResolver = new ConfigurationRuntimeImageResolver(
    config.runtimeImageMappings,
  );
  const dockerClient = createDockerClient(config.docker);
  const containerProvisioner = new DockerContainerProvisioner(dockerClient);
  const deploymentTrigger = new GitHubActionsDeploymentTrigger(
    config.githubActions,
    fetch,
  );

  return {
    logger,
    worker: new ProvisioningWorker(logger, config.statusLogIntervalMs),
    provisioningService: new ProvisioningService(
      imageResolver,
      containerProvisioner,
      deploymentTrigger,
    ),
  };
}
