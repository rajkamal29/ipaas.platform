import type {
  RuntimeRequest,
  RuntimeResult,
} from "../../../application/dto/provisioning.js";
import type { RuntimeProvisioner } from "../../../application/ports/runtime/runtime-provisioner.js";
import {
  DependencyError,
  UnsupportedSyncTypeError,
} from "../../../application/errors/provisioning-errors.js";
import type { GitHubActionsOptions } from "../../../config/github-actions.js";
export type HttpClient = (url: string, init: RequestInit) => Promise<Response>;
export class GitHubActionsDeploymentTrigger implements RuntimeProvisioner {
  constructor(
    private readonly options: GitHubActionsOptions,
    private readonly http: HttpClient,
  ) {}
  async provision(request: RuntimeRequest): Promise<RuntimeResult> {
    if (request.syncType === "interval")
      throw new UnsupportedSyncTypeError(request.syncType);
    const base = this.options.apiBaseUrl.replace(/\/$/, "");
    const path = [this.options.owner, this.options.repository]
      .map(encodeURIComponent)
      .join("/");
    const endpoint = `${base}/repos/${path}/actions/workflows/${encodeURIComponent(this.options.workflowId)}/dispatches`;
    let response: Response;
    try {
      response = await this.http(endpoint, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(this.options.timeoutMs),
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.options.token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          ref: this.options.ref,
          inputs: {
            sync_entity_id: request.syncEntityId,
            image_reference: request.imageReference,
          },
        }),
      });
    } catch {
      throw new DependencyError("runtime", true, {
        dependency: "github",
        operation: "workflow-dispatch",
      });
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new DependencyError(
        "runtime",
        response.status >= 500 || response.status === 408,
        {
          dependency: "github",
          operation: "workflow-dispatch",
          httpStatus: response.status,
        },
      );
    }
    await response.body?.cancel().catch(() => undefined);
    // Dispatch acknowledgements are not runtime readiness or completion.
    return {
      kind: "accepted",
      reference: `github:${this.options.owner}/${this.options.repository}:${request.syncEntityId}`,
    };
  }
}
