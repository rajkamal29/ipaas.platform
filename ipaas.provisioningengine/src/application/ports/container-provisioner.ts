import type {
  ContainerProvisioningResult,
  ProvisionContainerRequest,
} from "../models/container-provisioning.js";

export interface ContainerProvisioner {
  provision(request: ProvisionContainerRequest): Promise<ContainerProvisioningResult>;
  inspect(containerId: string): Promise<ContainerProvisioningResult>;
  getLogs(containerId: string): Promise<string>;
}
