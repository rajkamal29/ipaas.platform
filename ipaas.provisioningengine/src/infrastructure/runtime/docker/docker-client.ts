import Docker from "dockerode";
import type { DockerConnectionOptions } from "../../../config/docker.js";
export interface DockerInspection {
  readonly Id: string;
  readonly Config: {
    readonly Image: string;
    readonly Env?: string[];
    readonly Labels?: Record<string, string> | null;
  };
  readonly State: { readonly Status: string; readonly ExitCode: number };
  readonly HostConfig: { readonly NetworkMode: string };
}
export interface DockerContainer {
  inspect(): Promise<DockerInspection>;
  start(): Promise<unknown>;
}
export interface DockerClient {
  getContainer(name: string): DockerContainer;
  ensureImage(image: string): Promise<void>;
  createContainer(options: {
    Image: string;
    name: string;
    Env: string[];
    Labels: Record<string, string>;
    HostConfig: {
      NetworkMode: string;
      RestartPolicy: { Name: "no" };
      AutoRemove: false;
    };
  }): Promise<DockerContainer>;
}
export function dockerStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error))
    return undefined;
  return typeof error.statusCode === "number" ? error.statusCode : undefined;
}
export function createDockerClient(
  options: DockerConnectionOptions,
): DockerClient {
  const docker = new Docker({
    socketPath: options.socketPath,
    timeout: options.timeoutMs,
  });
  return {
    getContainer: (name) => wrapContainer(docker.getContainer(name)),
    createContainer: async (options) =>
      wrapContainer(await docker.createContainer(options)),
    ensureImage: async (image) => {
      try {
        await docker.getImage(image).inspect();
        return;
      } catch (error: unknown) {
        if (dockerStatus(error) !== 404) throw error;
      }
      const stream = await docker.pull(image);
      await new Promise<void>((resolve, reject) => {
        docker.modem.followProgress(stream, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

function wrapContainer(container: Docker.Container): DockerContainer {
  return {
    start: () => container.start(),
    inspect: async () => {
      const value = await container.inspect();
      return {
        Id: value.Id,
        Config: value.Config,
        State: value.State,
        HostConfig: { NetworkMode: value.HostConfig.NetworkMode ?? "default" },
      };
    },
  };
}
