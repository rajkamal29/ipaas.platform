export interface RuntimeMetadata {
  integrationId: string;
  tenantId: string;
  syncMode: string;
}

export interface ProvisionContainerRequest {
  imageReference: string;
  containerName: string;
  metadata: RuntimeMetadata;
}

export interface ContainerProvisioningResult {
  containerId: string;
  containerName: string;
  imageReference: string;
  status: string;
}
