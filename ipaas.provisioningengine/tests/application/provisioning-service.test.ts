import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ContainerProvisioningResult,
  ProvisionContainerRequest,
} from "../../src/application/models/container-provisioning.js";
import type {
  DeploymentDispatchResult,
  DeploymentRequest,
} from "../../src/application/models/deployment.js";
import type { ContainerProvisioner } from "../../src/application/ports/container-provisioner.js";
import type { DeploymentTrigger } from "../../src/application/ports/deployment-trigger.js";
import { ProvisioningService } from "../../src/application/provisioning-service.js";

describe("ProvisioningService", () => {
  it("resolves an image before local provisioning", async () => {
    let receivedRequest: ProvisionContainerRequest | undefined;
    const service = createService({
      provision: async (request) => {
        receivedRequest = request;
        return containerResult;
      },
      inspect: async () => containerResult,
      getLogs: async () => "logs",
    });

    const result = await service.provisionLocally({
      ...provisioningContext,
      containerName: "ipaas-integration-123",
    });

    assert.equal(result, containerResult);
    assert.deepEqual(receivedRequest, {
      imageReference: resolvedImage,
      containerName: "ipaas-integration-123",
      metadata: {
        integrationId: "integration-123",
        tenantId: "tenant-abc",
        syncMode: "ONE_TIME",
      },
    });
  });

  it("resolves an image before triggering deployment", async () => {
    let receivedRequest: DeploymentRequest | undefined;
    const deploymentResult: DeploymentDispatchResult = {
      accepted: true,
      statusCode: 204,
    };
    const service = createService(undefined, {
      trigger: async (request) => {
        receivedRequest = request;
        return deploymentResult;
      },
    });

    const result = await service.triggerDeployment(provisioningContext);

    assert.equal(result, deploymentResult);
    assert.deepEqual(receivedRequest, {
      ...provisioningContext,
      imageReference: resolvedImage,
    });
  });
});

const resolvedImage = "ghcr.io/tezo/workday-keka-runtime:1.0.0";
const provisioningContext = {
  integrationId: "integration-123",
  tenantId: "tenant-abc",
  sourceConnector: "workday",
  destinationConnector: "keka",
  syncMode: "ONE_TIME",
};
const containerResult: ContainerProvisioningResult = {
  containerId: "container-123",
  containerName: "ipaas-integration-123",
  imageReference: resolvedImage,
  status: "running",
};

function createService(
  containerProvisioner: ContainerProvisioner = {
    provision: async () => containerResult,
    inspect: async () => containerResult,
    getLogs: async () => "logs",
  },
  deploymentTrigger: DeploymentTrigger = {
    trigger: async () => ({ accepted: true, statusCode: 204 }),
  },
): ProvisioningService {
  return new ProvisioningService(
    { resolve: () => resolvedImage },
    containerProvisioner,
    deploymentTrigger,
  );
}
