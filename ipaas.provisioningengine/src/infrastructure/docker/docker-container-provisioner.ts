import type {
  ContainerProvisioningResult,
  ProvisionContainerRequest,
} from "../../application/models/container-provisioning.js";
import type { ContainerProvisioner } from "../../application/ports/container-provisioner.js";
import type {
  DockerClient,
  DockerContainerInspection,
} from "./docker-client.js";
import { ContainerProvisioningError } from "./docker-provisioning-error.js";

export class DockerContainerProvisioner implements ContainerProvisioner {
  public constructor(private readonly client: DockerClient) {}

  public async provision(
    request: ProvisionContainerRequest,
  ): Promise<ContainerProvisioningResult> {
    try {
      const container = await this.client.createContainer({
        Image: request.imageReference,
        name: request.containerName,
        Env: runtimeEnvironment(request),
      });

      await container.start();
      return mapInspection(await container.inspect());
    } catch (error: unknown) {
      throw new ContainerProvisioningError(
        "create/start",
        request.containerName,
        error,
      );
    }
  }

  public async inspect(containerId: string): Promise<ContainerProvisioningResult> {
    try {
      return mapInspection(await this.client.getContainer(containerId).inspect());
    } catch (error: unknown) {
      throw new ContainerProvisioningError("inspect", containerId, error);
    }
  }

  public async getLogs(containerId: string): Promise<string> {
    try {
      const logs = await this.client.getContainer(containerId).logs({
        stdout: true,
        stderr: true,
        follow: false,
      });

      return decodeDockerLogs(logs);
    } catch (error: unknown) {
      throw new ContainerProvisioningError("logs", containerId, error);
    }
  }
}

function runtimeEnvironment(request: ProvisionContainerRequest): string[] {
  return [
    `INTEGRATION_ID=${request.metadata.integrationId}`,
    `TENANT_ID=${request.metadata.tenantId}`,
    `SYNC_MODE=${request.metadata.syncMode}`,
  ];
}

function mapInspection(inspection: DockerContainerInspection): ContainerProvisioningResult {
  return {
    containerId: inspection.Id,
    containerName: inspection.Name.replace(/^\//, ""),
    imageReference: inspection.Config.Image,
    status: inspection.State.Status,
  };
}

function decodeDockerLogs(buffer: Buffer): string {
  const chunks: Buffer[] = [];
  let offset = 0;

  while (offset + 8 <= buffer.length && buffer[offset + 1] === 0) {
    const length = buffer.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = start + length;

    if (end > buffer.length) {
      return buffer.toString("utf8");
    }

    chunks.push(buffer.subarray(start, end));
    offset = end;
  }

  return (chunks.length > 0 && offset === buffer.length ? Buffer.concat(chunks) : buffer)
    .toString("utf8");
}
