import type { RuntimeRequest, RuntimeResult } from "../../dto/provisioning.js";
export interface RuntimeProvisioner {
  provision(request: RuntimeRequest): Promise<RuntimeResult>;
}
