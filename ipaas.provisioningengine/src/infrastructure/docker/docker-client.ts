import Docker from "dockerode";
import type { DockerConnectionOptions } from "../../config/docker.js";

export interface DockerContainerHandle {
  readonly id: string;
  start(): Promise<unknown>;
  inspect(): Promise<DockerContainerInspection>;
  logs(options: { stdout: true; stderr: true; follow: false }): Promise<Buffer>;
}

export interface DockerContainerInspection {
  Id: string;
  Name: string;
  Config: { Image: string };
  State: { Status: string };
}

export interface DockerClient {
  createContainer(options: {
    Image: string;
    name: string;
    Env: string[];
  }): Promise<DockerContainerHandle>;
  getContainer(id: string): DockerContainerHandle;
}

export function createDockerClient(options: DockerConnectionOptions): DockerClient {
  return new Docker({ socketPath: options.socketPath }) as DockerClient;
}
