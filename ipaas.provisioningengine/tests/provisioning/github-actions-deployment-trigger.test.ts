import assert from "node:assert/strict";
import { it } from "node:test";
import { GitHubActionsDeploymentTrigger } from "../../src/infrastructure/runtime/github/github-actions-deployment-trigger.js";
import {
  DependencyError,
  UnsupportedSyncTypeError,
} from "../../src/application/errors/provisioning-errors.js";
import type { GitHubActionsOptions } from "../../src/config/github-actions.js";
import { uuid } from "../../src/domain/value-objects/uuid.js";
import type { RuntimeRequest } from "../../src/application/dto/provisioning.js";
const options: GitHubActionsOptions = {
  apiBaseUrl: "https://api.github.test",
  owner: "test",
  repository: "platform",
  workflowId: "provision-runtime.yml",
  ref: "dev",
  token: "test-token",
  timeoutMs: 1000,
};
const request: RuntimeRequest = {
  syncEntityId: uuid("10000000-0000-4000-8000-000000000001"),
  imageReference: "ghcr.io/test/runtime:v1",
  syncType: "one_time",
  intervalSeconds: null,
};
it("dispatches the configured ref and new runtime contract without secrets", async () => {
  const adapter = new GitHubActionsDeploymentTrigger(
    options,
    async (url, init) => {
      assert.equal(
        url,
        "https://api.github.test/repos/test/platform/actions/workflows/provision-runtime.yml/dispatches",
      );
      assert.equal(init.redirect, "error");
      assert.ok(init.signal);
      assert.deepEqual(JSON.parse(String(init.body)), {
        ref: "dev",
        inputs: {
          sync_entity_id: request.syncEntityId,
          image_reference: request.imageReference,
        },
      });
      assert.ok(!String(init.body).includes("test-token"));
      return new Response(null, { status: 204 });
    },
  );
  assert.equal((await adapter.provision(request)).kind, "accepted");
});
it("sanitizes rejected and ambiguous GitHub failures", async () => {
  for (const status of [403, 500]) {
    const adapter = new GitHubActionsDeploymentTrigger(
      options,
      async () => new Response("secret server body", { status }),
    );
    await assert.rejects(
      adapter.provision(request),
      (error) =>
        error instanceof DependencyError &&
        error.uncertain === (status === 500) &&
        error.diagnostics?.dependency === "github" &&
        error.diagnostics.operation === "workflow-dispatch" &&
        error.diagnostics.httpStatus === status &&
        !error.message.includes("secret"),
    );
  }
  const adapter = new GitHubActionsDeploymentTrigger(options, async () => {
    throw new Error("secret transport detail");
  });
  await assert.rejects(
    adapter.provision(request),
    (error) => error instanceof DependencyError && error.uncertain,
  );
});
it("rejects interval dispatch without a scheduler", async () => {
  const adapter = new GitHubActionsDeploymentTrigger(options, async () => {
    throw new Error("must not dispatch");
  });
  await assert.rejects(
    adapter.provision({
      ...request,
      syncType: "interval",
      intervalSeconds: 60,
    }),
    UnsupportedSyncTypeError,
  );
});
