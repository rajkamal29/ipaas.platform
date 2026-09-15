export interface GitHubActionsOptions {
  readonly apiBaseUrl: string;
  readonly owner: string;
  readonly repository: string;
  readonly workflowId: string;
  readonly ref: string;
  readonly token: string;
  readonly timeoutMs: number;
}
export function loadGitHubActionsOptions(
  environment: NodeJS.ProcessEnv,
): GitHubActionsOptions {
  const required = (key: string): string => {
    const value = environment[key];
    if (!value?.trim())
      throw new Error(`${key} is required for GitHub runtime provisioning.`);
    return value;
  };
  const apiBaseUrl =
    environment.GITHUB_ACTIONS_API_BASE_URL ?? "https://api.github.com";
  let url: URL;
  try {
    url = new URL(apiBaseUrl);
  } catch {
    throw new Error("Invalid GITHUB_ACTIONS_API_BASE_URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "GitHub API URL must use HTTPS without credentials, query, or fragment.",
    );
  return {
    apiBaseUrl,
    owner: required("GITHUB_ACTIONS_OWNER"),
    repository: required("GITHUB_ACTIONS_REPOSITORY"),
    workflowId: required("GITHUB_ACTIONS_WORKFLOW"),
    ref: required("GITHUB_ACTIONS_REF"),
    token: required("GITHUB_TOKEN"),
    timeoutMs: 30000,
  };
}
