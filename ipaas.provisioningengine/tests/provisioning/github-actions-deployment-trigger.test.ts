import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GitHubActionsOptions } from "../../src/config/github-actions.js";
import {
  DeploymentTriggerConfigurationError,
  DeploymentTriggerError,
} from "../../src/infrastructure/github/deployment-trigger-errors.js";
import {
  GitHubActionsDeploymentTrigger,
  type HttpClient,
} from "../../src/infrastructure/github/github-actions-deployment-trigger.js";

const deploymentRequest = {
  integrationId: "integration-123",
  tenantId: "tenant-abc",
  sourceConnector: "workday",
  destinationConnector: "keka",
  syncMode: "ONE_TIME",
  imageReference: "ghcr.io/tezo/workday-keka-runtime:1.0.0",
};

describe("GitHubActionsDeploymentTrigger", () => {
  it("uses the configured workflow-dispatch endpoint", async () => {
    const capture = createCaptureClient();
    await new GitHubActionsDeploymentTrigger(createOptions(), capture.client)
      .trigger(deploymentRequest);

    assert.equal(
      capture.url,
      "https://api.github.test/repos/tezo/ipaas-runtime/actions/workflows/provision-runtime.yml/dispatches",
    );
    assert.equal(capture.init?.method, "POST");
  });

  it("sends the configured ref", async () => {
    const capture = createCaptureClient();
    await new GitHubActionsDeploymentTrigger(createOptions(), capture.client)
      .trigger(deploymentRequest);

    assert.equal(requestBody(capture.init).ref, "dev-node");
  });

  it("sends all six deployment inputs", async () => {
    const capture = createCaptureClient();
    await new GitHubActionsDeploymentTrigger(createOptions(), capture.client)
      .trigger(deploymentRequest);

    assert.deepEqual(requestBody(capture.init).inputs, {
      integration_id: "integration-123",
      tenant_id: "tenant-abc",
      source_connector: "workday",
      destination_connector: "keka",
      sync_mode: "ONE_TIME",
      image_reference: "ghcr.io/tezo/workday-keka-runtime:1.0.0",
    });
  });

  it("fails clearly when required configuration is missing", async () => {
    const options = { ...createOptions(), owner: undefined, token: undefined };
    const trigger = new GitHubActionsDeploymentTrigger(options, createCaptureClient().client);

    await assert.rejects(
      trigger.trigger(deploymentRequest),
      (error: unknown) => {
        assert.ok(error instanceof DeploymentTriggerConfigurationError);
        assert.deepEqual(error.missingSettings, ["GITHUB_ACTIONS_OWNER", "GITHUB_TOKEN"]);
        return true;
      },
    );
  });

  it("wraps GitHub API failures in a domain-specific error", async () => {
    const client: HttpClient = async () => new Response(
      JSON.stringify({ message: "Workflow not found" }),
      { status: 404, statusText: "Not Found" },
    );
    const trigger = new GitHubActionsDeploymentTrigger(createOptions(), client);

    await assert.rejects(
      trigger.trigger(deploymentRequest),
      (error: unknown) => {
        assert.ok(error instanceof DeploymentTriggerError);
        assert.equal(error.statusCode, 404);
        assert.match(error.message, /Workflow not found/);
        return true;
      },
    );
  });

  it("returns run details when GitHub supplies them", async () => {
    const client: HttpClient = async () => new Response(JSON.stringify({
      workflow_run_id: 42,
      run_url: "https://api.github.test/repos/tezo/ipaas-runtime/actions/runs/42",
      html_url: "https://github.test/tezo/ipaas-runtime/actions/runs/42",
    }), { status: 200 });

    assert.deepEqual(
      await new GitHubActionsDeploymentTrigger(createOptions(), client)
        .trigger(deploymentRequest),
      {
        accepted: true,
        statusCode: 200,
        runId: 42,
        runUrl: "https://api.github.test/repos/tezo/ipaas-runtime/actions/runs/42",
        htmlUrl: "https://github.test/tezo/ipaas-runtime/actions/runs/42",
      },
    );
  });

  it("accepts a successful response without inventing run details", async () => {
    const client: HttpClient = async () => new Response(null, { status: 204 });

    assert.deepEqual(
      await new GitHubActionsDeploymentTrigger(createOptions(), client)
        .trigger(deploymentRequest),
      { accepted: true, statusCode: 204 },
    );
  });
});

function createOptions(): GitHubActionsOptions {
  return {
    apiBaseUrl: "https://api.github.test",
    owner: "tezo",
    repository: "ipaas-runtime",
    workflowId: "provision-runtime.yml",
    ref: "dev-node",
    token: "unit-test-token",
  };
}

function createCaptureClient(): {
  client: HttpClient;
  url?: string;
  init?: RequestInit;
} {
  const capture: {
    client: HttpClient;
    url?: string;
    init?: RequestInit;
  } = {
    client: async (input, init) => {
      capture.url = input.toString();
      capture.init = init;
      return new Response(null, { status: 204 });
    },
  };

  return capture;
}

function requestBody(init: RequestInit | undefined): {
  ref: string;
  inputs: Record<string, string>;
} {
  const body = init?.body;
  assert.equal(typeof body, "string");
  return JSON.parse(body as string) as {
    ref: string;
    inputs: Record<string, string>;
  };
}
