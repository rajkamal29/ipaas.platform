import { composeApplication } from "../bootstrap.js";
import type { ProvisioningContext } from "../application/provisioning-service.js";
import type { RuntimeImageMapping } from "../config/runtime-images.js";
import { ConfigurationRuntimeImageResolver } from "../infrastructure/runtime-images/configuration-runtime-image-resolver.js";

const enabled = process.env.RUN_GITHUB_INTEGRATION_TESTS?.toLowerCase() === "true";

if (!enabled) {
  console.log(
    "ONE_TIME provisioning demo skipped; set RUN_GITHUB_INTEGRATION_TESTS=true to enable it.",
  );
} else {
  const demo = selectDemo(process.env.ONE_TIME_DEMO_REGISTRY);
  process.env.RUNTIME_IMAGE_MAPPINGS_JSON = JSON.stringify([demo.mapping]);

  const request: ProvisioningContext = {
    integrationId: `node-one-time-${demo.name.toLowerCase()}-${Date.now()}`,
    tenantId: "tenant-demo",
    sourceConnector: demo.mapping.sourceConnector,
    destinationConnector: demo.mapping.destinationConnector,
    syncMode: "ONE_TIME",
  };
  const imageReference = new ConfigurationRuntimeImageResolver([demo.mapping]).resolve(
    request.sourceConnector,
    request.destinationConnector,
  );

  console.log("ONE_TIME provisioning demo");
  console.log(JSON.stringify({ integrationMetadata: request }, null, 2));
  console.log(JSON.stringify({ resolvedImage: imageReference }, null, 2));

  const { provisioningService } = composeApplication();
  const dispatchResult = await provisioningService.triggerDeployment(request);

  console.log(JSON.stringify({ dispatchResult }, null, 2));
}

interface DemoSelection {
  name: "DockerHub" | "GHCR";
  mapping: RuntimeImageMapping;
}

function selectDemo(registry: string | undefined): DemoSelection {
  if (registry?.toLowerCase() === "dockerhub") {
    return {
      name: "DockerHub",
      mapping: {
        sourceConnector: "bamboohr",
        destinationConnector: "keka",
        registry: "DockerHub",
        repository: "library/hello-world",
        tag: "latest",
      },
    };
  }

  if (registry !== undefined && registry.toLowerCase() !== "ghcr") {
    throw new Error("ONE_TIME_DEMO_REGISTRY must be GHCR or DockerHub.");
  }

  return {
    name: "GHCR",
    mapping: {
      sourceConnector: "workday",
      destinationConnector: "keka",
      registry: "GHCR",
      repository: "jonashackt/hello-world",
      tag: "latest",
    },
  };
}
