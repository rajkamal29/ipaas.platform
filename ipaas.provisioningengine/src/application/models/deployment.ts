export interface DeploymentRequest {
  integrationId: string;
  tenantId: string;
  sourceConnector: string;
  destinationConnector: string;
  syncMode: string;
  imageReference: string;
}

export interface DeploymentDispatchResult {
  accepted: true;
  statusCode: number;
  runId?: number;
  runUrl?: string;
  htmlUrl?: string;
}
