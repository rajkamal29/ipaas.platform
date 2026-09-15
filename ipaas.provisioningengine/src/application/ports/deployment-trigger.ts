import type {
  DeploymentDispatchResult,
  DeploymentRequest,
} from "../models/deployment.js";

export interface DeploymentTrigger {
  trigger(request: DeploymentRequest): Promise<DeploymentDispatchResult>;
}
