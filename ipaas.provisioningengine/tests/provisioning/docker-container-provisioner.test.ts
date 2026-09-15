import assert from "node:assert/strict";
import { it } from "node:test";
import { DockerContainerProvisioner } from "../../src/infrastructure/runtime/docker/docker-container-provisioner.js";
import type {
  DockerClient,
  DockerInspection,
} from "../../src/infrastructure/runtime/docker/docker-client.js";
import {
  DependencyError,
  RuntimeReconciliationRequiredError,
  UnsupportedSyncTypeError,
} from "../../src/application/errors/provisioning-errors.js";
import { uuid } from "../../src/domain/value-objects/uuid.js";
import type { RuntimeRequest } from "../../src/application/dto/provisioning.js";
const id = uuid("10000000-0000-4000-8000-000000000001");
const request: RuntimeRequest = {
  syncEntityId: id,
  imageReference: "ghcr.io/test/runtime:v1",
  syncType: "one_time",
  intervalSeconds: null,
};
const environment = {
  databaseUrl: "postgres://test.invalid/platform",
  encryptionMasterKey: "test-key",
};
function setup(initial = "missing") {
  let status = initial;
  let starts = 0;
  let creates = 0;
  let pulls = 0;
  let options: Parameters<DockerClient["createContainer"]>[0] | undefined;
  let conflict = false;
  let mismatch = false;
  let exitCode = 0;
  let startFailure = false;
  const container = {
    inspect: async (): Promise<DockerInspection> => {
      if (status === "missing") throw { statusCode: 404 };
      return {
        Id: "container-id",
        Config: {
          Image: request.imageReference,
          Env: [
            `SYNC_ENTITY_ID=${id}`,
            `DATABASE_URL=${environment.databaseUrl}`,
            `ENCRYPTION_MASTER_KEY=${environment.encryptionMasterKey}`,
          ],
          Labels: { "ipaas.sync-entity-id": mismatch ? "someone-else" : id },
        },
        HostConfig: { NetworkMode: "ipaas-network" },
        State: { Status: status, ExitCode: exitCode },
      };
    },
    start: async () => {
      starts++;
      if (startFailure)
        throw { statusCode: 500, message: "secret daemon payload" };
      status = "running";
    },
  };
  const client: DockerClient = {
    getContainer: () => container,
    ensureImage: async () => {
      pulls++;
    },
    createContainer: async (value) => {
      creates++;
      options = value;
      status = "created";
      if (conflict) throw { statusCode: 409 };
      return container;
    },
  };
  return {
    adapter: new DockerContainerProvisioner(
      client,
      environment,
      "ipaas-network",
    ),
    counts: () => ({ starts, creates, pulls }),
    options: () => options,
    conflict: () => {
      conflict = true;
    },
    mismatch: () => {
      mismatch = true;
    },
    failStart: () => {
      startFailure = true;
    },
    failExit: () => {
      exitCode = 1;
    },
  };
}
it("creates a deterministic runtime with platform configuration and no tenant credentials", async () => {
  const fake = setup();
  assert.equal((await fake.adapter.provision(request)).kind, "started");
  assert.equal(fake.options()?.name, `ipaas-sync-${id}`);
  assert.deepEqual(fake.options()?.Env, [
    `SYNC_ENTITY_ID=${id}`,
    `DATABASE_URL=${environment.databaseUrl}`,
    `ENCRYPTION_MASTER_KEY=${environment.encryptionMasterKey}`,
  ]);
  assert.equal(fake.options()?.HostConfig.NetworkMode, "ipaas-network");
  assert.deepEqual(fake.counts(), { starts: 1, creates: 1, pulls: 1 });
});
it("reuses running and executed containers without restarting a cycle", async () => {
  for (const status of ["running", "exited"]) {
    const fake = setup(status);
    await fake.adapter.provision(request);
    await fake.adapter.provision(request);
    assert.deepEqual(fake.counts(), { starts: 0, creates: 0, pulls: 0 });
  }
});
it("requires reconciliation after a create conflict with an unstarted container", async () => {
  const fake = setup();
  fake.conflict();
  await assert.rejects(
    fake.adapter.provision(request),
    RuntimeReconciliationRequiredError,
  );
  assert.equal(fake.counts().starts, 0);
});
it("rejects an identity collision instead of deleting another workload", async () => {
  const fake = setup("running");
  fake.mismatch();
  await assert.rejects(
    fake.adapter.provision(request),
    (error) => error instanceof DependencyError && error.uncertain,
  );
  assert.equal(fake.counts().starts, 0);
});
it("reports unsuccessful exits without restarting", async () => {
  const fake = setup("exited");
  fake.failExit();
  await assert.rejects(fake.adapter.provision(request), DependencyError);
});
it("does not pretend that one-shot Docker creates an interval schedule", async () => {
  const fake = setup();
  await assert.rejects(
    fake.adapter.provision({
      ...request,
      syncType: "interval",
      intervalSeconds: 60,
    }),
    UnsupportedSyncTypeError,
  );
  assert.equal(fake.counts().creates, 0);
});

for (const status of ["created", "dead", "paused", "restarting", "removing"]) {
  it(
    "requires reconciliation without starting an existing " +
      status +
      " container",
    async () => {
      const fake = setup(status);
      await assert.rejects(
        fake.adapter.provision(request),
        (error) =>
          error instanceof RuntimeReconciliationRequiredError &&
          error.uncertain,
      );
      assert.equal(fake.counts().starts, 0);
    },
  );
}
it("wraps a creator's failed start with safe diagnostics and an uncertain outcome", async () => {
  const fake = setup();
  fake.failStart();
  await assert.rejects(fake.adapter.provision(request), (error) => {
    assert.ok(error instanceof DependencyError);
    assert.equal(error.uncertain, true);
    assert.deepEqual(error.diagnostics, {
      dependency: "docker",
      operation: "start-container",
      httpStatus: 500,
    });
    assert.ok(!JSON.stringify(error).includes("secret"));
    return true;
  });
  assert.equal(fake.counts().starts, 1);
});
for (const staleCreatedSnapshot of [false, true]) {
  it(
    "starts exactly once across two callers and a create conflict: " +
      (staleCreatedSnapshot
        ? "stale created snapshot"
        : "exit before conflict inspection"),
    async () => {
      let status = "missing";
      let starts = 0;
      let creates = 0;
      let initialInspections = 0;
      const bothInspected = deferred();
      const exited = deferred();
      function client(): DockerClient {
        let firstInspection = true;
        let lostCreation = false;
        const container = {
          async inspect(): Promise<DockerInspection> {
            if (firstInspection) {
              firstInspection = false;
              if (++initialInspections === 2) bothInspected.resolve();
              await bothInspected.promise;
              throw { statusCode: 404 };
            }
            if (lostCreation && !staleCreatedSnapshot) await exited.promise;
            const snapshot = {
              Id: "container-id",
              Config: {
                Image: request.imageReference,
                Labels: { "ipaas.sync-entity-id": id },
                Env: [
                  "SYNC_ENTITY_ID=" + id,
                  "DATABASE_URL=" + environment.databaseUrl,
                  "ENCRYPTION_MASTER_KEY=" + environment.encryptionMasterKey,
                ],
              },
              HostConfig: { NetworkMode: "ipaas-network" },
              State: {
                Status:
                  lostCreation && staleCreatedSnapshot ? "created" : status,
                ExitCode: 0,
              },
            };
            if (lostCreation) await exited.promise;
            return snapshot;
          },
          async start() {
            starts++;
            status = "exited";
            exited.resolve();
          },
        };
        return {
          getContainer: (name) => {
            assert.equal(name, "ipaas-sync-" + id);
            return container;
          },
          ensureImage: async () => undefined,
          createContainer: async (options) => {
            assert.equal(options.name, "ipaas-sync-" + id);
            creates++;
            if (status !== "missing") {
              lostCreation = true;
              throw { statusCode: 409 };
            }
            status = "created";
            return container;
          },
        };
      }
      const first = new DockerContainerProvisioner(
        client(),
        environment,
        "ipaas-network",
      );
      const second = new DockerContainerProvisioner(
        client(),
        environment,
        "ipaas-network",
      );
      const results = await Promise.allSettled([
        first.provision(request),
        second.provision(request),
      ]);
      assert.equal(creates, 2);
      assert.equal(starts, 1);
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        staleCreatedSnapshot ? 1 : 2,
      );
      for (const result of results) {
        if (result.status === "fulfilled")
          assert.equal(result.value.kind, "already-executed");
        else
          assert.ok(
            result.reason instanceof RuntimeReconciliationRequiredError,
          );
      }
    },
  );
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
