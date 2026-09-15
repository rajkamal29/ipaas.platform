export interface GitHubActionsOptions {
  apiBaseUrl: string | undefined;
  owner: string | undefined;
  repository: string | undefined;
  workflowId: string | undefined;
  ref: string | undefined;
  token: string | undefined;
}

export function loadGitHubActionsOptions(
  environment: NodeJS.ProcessEnv = process.env,
): GitHubActionsOptions {
  return {
    apiBaseUrl: environment.GITHUB_ACTIONS_API_BASE_URL,
    owner: environment.GITHUB_ACTIONS_OWNER,
    repository: environment.GITHUB_ACTIONS_REPOSITORY,
    workflowId: environment.GITHUB_ACTIONS_WORKFLOW,
    ref: environment.GITHUB_ACTIONS_REF,
    token: environment.GITHUB_TOKEN,
  };
}
