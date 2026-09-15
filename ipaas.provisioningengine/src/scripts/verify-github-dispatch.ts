import { loadGitHubActionsOptions } from "../config/github-actions.js";
import { GitHubActionsDeploymentTrigger } from "../infrastructure/github/github-actions-deployment-trigger.js";

if (process.env.RUN_GITHUB_INTEGRATION_TESTS?.toLowerCase() !== "true") {
  console.log("GitHub integration verification skipped; set RUN_GITHUB_INTEGRATION_TESTS=true to enable it.");
} else {
  const suffix = Date.now();
  const trigger = new GitHubActionsDeploymentTrigger(
    loadGitHubActionsOptions(process.env),
    fetch,
  );
  const result = await trigger.trigger({
    integrationId: `node-live-${suffix}`,
    tenantId: "tenant-abc",
    sourceConnector: "workday",
    destinationConnector: "keka",
    syncMode: "ONE_TIME",
    imageReference: process.env.GITHUB_INTEGRATION_TEST_IMAGE ?? "hello-world:latest",
  });

  console.log(JSON.stringify(result, null, 2));
}
