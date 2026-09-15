import type {
  ContainerProvisioningResult,
  RuntimeMetadata,
} from "./models/container-provisioning.js";
import type { DeploymentDispatchResult } from "./models/deployment.js";
import type { ContainerProvisioner } from "./ports/container-provisioner.js";
import type { DeploymentTrigger } from "./ports/deployment-trigger.js";
import type { RuntimeImageResolver } from "./ports/runtime-image-resolver.js";

export interface ProvisioningContext extends RuntimeMetadata {
  sourceConnector: string;
  destinationConnector: string;
}

export interface LocalProvisioningRequest extends ProvisioningContext {
  containerName: string;
}

export class ProvisioningService {
  public constructor(
    private readonly imageResolver: RuntimeImageResolver,
    private readonly containerProvisioner: ContainerProvisioner,
    private readonly deploymentTrigger: DeploymentTrigger,
  ) {}

  public async provisionLocally(
    request: LocalProvisioningRequest,
  ): Promise<ContainerProvisioningResult> {
    const imageReference = this.resolveImage(request);

    return this.containerProvisioner.provision({
      imageReference,
      containerName: request.containerName,
      metadata: runtimeMetadata(request),
    });
  }

  public async triggerDeployment(
    request: ProvisioningContext,
  ): Promise<DeploymentDispatchResult> {
    const imageReference = this.resolveImage(request);

    return this.deploymentTrigger.trigger({
      ...request,
      imageReference,
    });
  }

  private resolveImage(request: ProvisioningContext): string {
    return this.imageResolver.resolve(
      request.sourceConnector,
      request.destinationConnector,
    );
  }
}

function runtimeMetadata(context: ProvisioningContext): RuntimeMetadata {
  return {
    integrationId: context.integrationId,
    tenantId: context.tenantId,
    syncMode: context.syncMode,
  };
}
