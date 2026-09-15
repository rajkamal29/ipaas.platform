export interface DockerConnectionOptions {
  socketPath: string;
}

export function loadDockerConnectionOptions(
  environment: NodeJS.ProcessEnv = process.env,
): DockerConnectionOptions {
  return {
    socketPath: environment.DOCKER_SOCKET_PATH
      ?? (process.platform === "win32" ? "//./pipe/docker_engine" : "/var/run/docker.sock"),
  };
}
