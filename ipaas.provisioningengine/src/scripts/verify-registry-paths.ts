import type { DeploymentRequest } from "../application/models/deployment.js";
import { loadGitHubActionsOptions } from "../config/github-actions.js";
import type { RuntimeImageMapping } from "../config/runtime-images.js";
import { GitHubActionsDeploymentTrigger } from "../infrastructure/github/github-actions-deployment-trigger.js";
import { ConfigurationRuntimeImageResolver } from "../infrastructure/runtime-images/configuration-runtime-image-resolver.js";

const enabled = process.env.RUN_GITHUB_INTEGRATION_TESTS?.toLowerCase() === "true";

if (!enabled) {
  console.log(
    "Registry-path verification skipped; set RUN_GITHUB_INTEGRATION_TESTS=true to enable it.",
  );
} else {
  const validationMappings: readonly RuntimeImageMapping[] = [
    {
      sourceConnector: "dockerhub-public-validation",
      destinationConnector: "demo",
      registry: "DockerHub",
      repository: "library/hello-world",
      tag: "latest",
    },
    {
      sourceConnector: "ghcr-public-validation",
      destinationConnector: "demo",
      registry: "GHCR",
      repository: "jonashackt/hello-world",
      tag: "latest",
    },
  ];
  const resolver = new ConfigurationRuntimeImageResolver(validationMappings);
  const trigger = new GitHubActionsDeploymentTrigger(
    loadGitHubActionsOptions(process.env),
    fetch,
  );

  for (const [index, mapping] of validationMappings.entries()) {
    const imageReference = resolver.resolve(
      mapping.sourceConnector,
      mapping.destinationConnector,
    );
    const request: DeploymentRequest = {
      integrationId: `node-registry-${mapping.registry.toLowerCase()}-${Date.now()}-${index + 1}`,
      tenantId: "tenant-registry-validation",
      sourceConnector: mapping.sourceConnector,
      destinationConnector: mapping.destinationConnector,
      syncMode: "ONE_TIME",
      imageReference,
    };

    console.log(JSON.stringify({ event: "runtime_image_resolved", imageReference }));
    const result = await trigger.trigger(request);
    console.log(JSON.stringify({ event: "workflow_dispatch_accepted", imageReference, result }));
  }
}
