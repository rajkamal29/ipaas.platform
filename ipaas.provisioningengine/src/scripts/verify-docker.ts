import { loadDockerConnectionOptions } from "../config/docker.js";
import { createDockerClient } from "../infrastructure/docker/docker-client.js";
import { DockerContainerProvisioner } from "../infrastructure/docker/docker-container-provisioner.js";

const dockerOptions = loadDockerConnectionOptions();
const provisioner = new DockerContainerProvisioner(createDockerClient(dockerOptions));
const suffix = Date.now();

const result = await provisioner.provision({
  imageReference: "hello-world:latest",
  containerName: `ipaas-provisioning-poc-${suffix}`,
  metadata: {
    integrationId: `docker-verification-${suffix}`,
    tenantId: "tenant-abc",
    syncMode: "ONE_TIME",
  },
});

await new Promise((resolve) => setTimeout(resolve, 1_000));

console.log(JSON.stringify(await provisioner.inspect(result.containerId), null, 2));
console.log(await provisioner.getLogs(result.containerId));
