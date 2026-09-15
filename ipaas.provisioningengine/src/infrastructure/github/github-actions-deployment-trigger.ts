import type {
  DeploymentDispatchResult,
  DeploymentRequest,
} from "../../application/models/deployment.js";
import type { DeploymentTrigger } from "../../application/ports/deployment-trigger.js";
import type { GitHubActionsOptions } from "../../config/github-actions.js";
import {
  DeploymentTriggerConfigurationError,
  DeploymentTriggerError,
} from "./deployment-trigger-errors.js";

export type HttpClient = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class GitHubActionsDeploymentTrigger implements DeploymentTrigger {
  public constructor(
    private readonly options: GitHubActionsOptions,
    private readonly httpClient: HttpClient,
  ) {}

  public async trigger(request: DeploymentRequest): Promise<DeploymentDispatchResult> {
    const options = validateOptions(this.options);

    let response: Response;
    try {
      response = await this.httpClient(dispatchEndpoint(options), {
        method: "POST",
        headers: githubHeaders(options.token),
        body: JSON.stringify(dispatchPayload(options.ref, request)),
      });
    } catch (error: unknown) {
      throw new DeploymentTriggerError(
        undefined,
        `GitHub Actions workflow dispatch request failed: ${errorMessage(error)}`,
        error,
      );
    }

    return handleResponse(response);
  }
}

interface ValidatedGitHubActionsOptions {
  apiBaseUrl: string;
  owner: string;
  repository: string;
  workflowId: string;
  ref: string;
  token: string;
}

function validateOptions(options: GitHubActionsOptions): ValidatedGitHubActionsOptions {
  const values = {
    GITHUB_ACTIONS_API_BASE_URL: options.apiBaseUrl,
    GITHUB_ACTIONS_OWNER: options.owner,
    GITHUB_ACTIONS_REPOSITORY: options.repository,
    GITHUB_ACTIONS_WORKFLOW: options.workflowId,
    GITHUB_ACTIONS_REF: options.ref,
    GITHUB_TOKEN: options.token,
  };
  const missingSettings = Object.entries(values)
    .filter(([, value]) => value === undefined || value.trim() === "")
    .map(([name]) => name);

  if (missingSettings.length > 0) {
    throw new DeploymentTriggerConfigurationError(missingSettings);
  }

  return {
    apiBaseUrl: options.apiBaseUrl!,
    owner: options.owner!,
    repository: options.repository!,
    workflowId: options.workflowId!,
    ref: options.ref!,
    token: options.token!,
  };
}

function dispatchEndpoint(options: ValidatedGitHubActionsOptions): string {
  let baseUrl: URL;
  try {
    baseUrl = new URL(options.apiBaseUrl.endsWith("/")
      ? options.apiBaseUrl
      : `${options.apiBaseUrl}/`);
  } catch {
    throw new DeploymentTriggerConfigurationError(["GITHUB_ACTIONS_API_BASE_URL"]);
  }

  return new URL(
    `repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repository)}`
      + `/actions/workflows/${encodeURIComponent(options.workflowId)}/dispatches`,
    baseUrl,
  ).toString();
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function dispatchPayload(ref: string, request: DeploymentRequest): object {
  return {
    ref,
    inputs: {
      integration_id: request.integrationId,
      tenant_id: request.tenantId,
      source_connector: request.sourceConnector,
      destination_connector: request.destinationConnector,
      sync_mode: request.syncMode,
      image_reference: request.imageReference,
    },
  };
}

async function handleResponse(response: Response): Promise<DeploymentDispatchResult> {
  const responseText = await response.text();
  if (!response.ok) {
    const detail = responseText.trim() === "" ? response.statusText : responseText;
    throw new DeploymentTriggerError(
      response.status,
      `GitHub Actions workflow dispatch failed with HTTP ${response.status}: ${detail}`,
    );
  }

  return {
    accepted: true,
    statusCode: response.status,
    ...parseRunDetails(responseText),
  };
}

function parseRunDetails(responseText: string): Partial<DeploymentDispatchResult> {
  if (responseText.trim() === "") {
    return {};
  }

  try {
    const body = JSON.parse(responseText) as Record<string, unknown>;
    return {
      ...(typeof body.workflow_run_id === "number" ? { runId: body.workflow_run_id } : {}),
      ...(typeof body.run_url === "string" ? { runUrl: body.run_url } : {}),
      ...(typeof body.html_url === "string" ? { htmlUrl: body.html_url } : {}),
    };
  } catch {
    return {};
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
