import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ContainerProvisioningError } from "../../src/infrastructure/docker/docker-provisioning-error.js";
import type { DockerClient } from "../../src/infrastructure/docker/docker-client.js";
import {
  DockerContainerProvisioner,
} from "../../src/infrastructure/docker/docker-container-provisioner.js";

const inspection = {
  Id: "container-123",
  Name: "/integration-test",
  Config: { Image: "hello-world:latest" },
  State: { Status: "exited" },
};

describe("DockerContainerProvisioner", () => {
  it("creates and starts a container with runtime metadata", async () => {
    let createOptions: unknown;
    let started = false;
    const container = {
      id: inspection.Id,
      start: async () => { started = true; },
      inspect: async () => inspection,
      logs: async () => Buffer.from("hello"),
    };
    const client: DockerClient = {
      createContainer: async (options) => {
        createOptions = options;
        return container;
      },
      getContainer: () => container,
    };
    const provisioner = new DockerContainerProvisioner(client);

    const result = await provisioner.provision({
      imageReference: "hello-world:latest",
      containerName: "integration-test",
      metadata: {
        integrationId: "integration-123",
        tenantId: "tenant-abc",
        syncMode: "ONE_TIME",
      },
    });

    assert.deepEqual(createOptions, {
      Image: "hello-world:latest",
      name: "integration-test",
      Env: [
        "INTEGRATION_ID=integration-123",
        "TENANT_ID=tenant-abc",
        "SYNC_MODE=ONE_TIME",
      ],
    });
    assert.equal(started, true);
    assert.deepEqual(result, {
      containerId: "container-123",
      containerName: "integration-test",
      imageReference: "hello-world:latest",
      status: "exited",
    });
  });

  it("inspects a container and maps its status", async () => {
    const client = createClient();
    const provisioner = new DockerContainerProvisioner(client);

    assert.deepEqual(await provisioner.inspect("container-123"), {
      containerId: "container-123",
      containerName: "integration-test",
      imageReference: "hello-world:latest",
      status: "exited",
    });
  });

  it("retrieves container logs", async () => {
    const provisioner = new DockerContainerProvisioner(createClient());

    assert.equal(await provisioner.getLogs("container-123"), "hello from Docker");
  });

  it("wraps Docker client failures in a domain-specific error", async () => {
    const client: DockerClient = {
      createContainer: async () => { throw new Error("daemon unavailable"); },
      getContainer: () => { throw new Error("not used"); },
    };
    const provisioner = new DockerContainerProvisioner(client);

    await assert.rejects(
      provisioner.provision({
        imageReference: "hello-world:latest",
        containerName: "integration-test",
        metadata: {
          integrationId: "integration-123",
          tenantId: "tenant-abc",
          syncMode: "ONE_TIME",
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof ContainerProvisioningError);
        assert.equal(error.operation, "create/start");
        assert.match(error.message, /daemon unavailable/);
        return true;
      },
    );
  });
});

function createClient(): DockerClient {
  const container = {
    id: inspection.Id,
    start: async () => undefined,
    inspect: async () => inspection,
    logs: async () => Buffer.from("hello from Docker"),
  };

  return {
    createContainer: async () => container,
    getContainer: () => container,
  };
}
