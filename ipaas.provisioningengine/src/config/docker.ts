export interface DockerConnectionOptions {
  readonly socketPath: string;
  readonly network: string;
  readonly timeoutMs: number;
}
export function loadDockerConnectionOptions(
  environment: NodeJS.ProcessEnv,
): DockerConnectionOptions {
  const timeoutMs = Number(environment.RUNTIME_TIMEOUT_MS ?? "120000");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000)
    throw new Error("RUNTIME_TIMEOUT_MS must be 1000–600000.");
  const network = environment.DOCKER_NETWORK ?? "ipaas-network";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(network))
    throw new Error("Invalid DOCKER_NETWORK.");
  return {
    socketPath:
      environment.DOCKER_SOCKET_PATH ??
      (process.platform === "win32"
        ? "//./pipe/docker_engine"
        : "/var/run/docker.sock"),
    network,
    timeoutMs,
  };
}
