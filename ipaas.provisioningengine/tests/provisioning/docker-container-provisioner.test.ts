import { ProvisionSyncEntityUseCase } from "../../src/application/use-cases/provision-sync-entity.js";
import type { SyncEntity } from "../../src/domain/entities/sync-entity.js";
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
function setup(
  initial = "missing",
  failure?:
    | "initial-inspect"
    | "ensure-image"
    | "create-container"
    | "pre-start-inspect"
    | "post-start-inspect",
) {
  let status = initial;
  let startedAt =
    initial === "running" || initial === "exited"
      ? "2026-09-21T10:00:00Z"
      : "0001-01-01T00:00:00Z";
  let fastExit = false;
  let starts = 0;
  let creates = 0;
  let pulls = 0;
  let options: Parameters<DockerClient["createContainer"]>[0] | undefined;
  let conflict = false;
  let mismatch = false;
  let exitCode = 0;
  let startFailure: number | undefined;
  const container = {
    inspect: async (): Promise<DockerInspection> => {
      if (
        failure === "initial-inspect" ||
        (failure === "pre-start-inspect" && status === "created") ||
        (failure === "post-start-inspect" && starts > 0)
      )
        throw { statusCode: 500, message: "secret daemon payload" };
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
        State: { Status: status, ExitCode: exitCode, StartedAt: startedAt },
      };
    },
    start: async () => {
      starts++;
      if (startFailure)
        throw { statusCode: startFailure, message: "secret daemon payload" };
      startedAt = "2026-09-21T10:00:00Z";
      status = fastExit ? "exited" : "running";
    },
  };
  const client: DockerClient = {
    getContainer: () => container,
    ensureImage: async () => {
      pulls++;
      if (failure === "ensure-image") throw { statusCode: 500 };
    },
    createContainer: async (value) => {
      creates++;
      if (failure === "create-container") throw { statusCode: 500 };
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
    failStart: (httpStatus = 500) => {
      startFailure = httpStatus;
    },
    fastExit: () => {
      fastExit = true;
    },
    unprovenStart: () => {
      startedAt = "0001-01-01T00:00:00Z";
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
  fake.fastExit();
  const result = await fake.adapter.provision(request);
  assert.equal(result.kind, "started");
  if (result.kind === "started") assert.equal(result.runtimeState, "exited");
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
                StartedAt:
                  status === "exited"
                    ? "2026-09-21T10:00:00Z"
                    : "0001-01-01T00:00:00Z",
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
          assert.equal(result.value.kind, "started");
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

for (const [failure, operation, creates, pulls] of [
  ["initial-inspect", "inspect-container", 0, 0],
  ["ensure-image", "ensure-image", 0, 1],
  ["create-container", "create-container", 1, 1],
  ["pre-start-inspect", "inspect-container", 1, 1],
] as const) {
  it("reports a certain failure before start: " + failure, async () => {
    const fake = setup("missing", failure);
    await assert.rejects(fake.adapter.provision(request), (error) => {
      assert.ok(error instanceof DependencyError);
      assert.equal(error.uncertain, false);
      assert.deepEqual(error.diagnostics, {
        dependency: "docker",
        operation,
        httpStatus: 500,
      });
      return true;
    });
    assert.deepEqual(fake.counts(), { starts: 0, creates, pulls });
  });
}
it("preserves uncertainty when inspection fails after start", async () => {
  const fake = setup("missing", "post-start-inspect");
  await assert.rejects(fake.adapter.provision(request), (error) => {
    assert.ok(error instanceof DependencyError);
    assert.equal(error.uncertain, true);
    assert.deepEqual(error.diagnostics, {
      dependency: "docker",
      operation: "inspect-container",
      httpStatus: 500,
    });
    return true;
  });
  assert.deepEqual(fake.counts(), { starts: 1, creates: 1, pulls: 1 });
});

it("reports an existing running container without starting or waiting on it", async () => {
  const fake = setup("running");
  assert.equal((await fake.adapter.provision(request)).kind, "started");
  assert.deepEqual(fake.counts(), { starts: 0, creates: 0, pulls: 0 });
});
it("accepts a fast nonzero execution exit as successful startup", async () => {
  const fake = setup();
  fake.failExit();
  fake.fastExit();
  const result = await fake.adapter.provision(request);
  assert.equal(result.kind, "started");
  if (result.kind === "started") assert.equal(result.runtimeState, "exited");
});

for (const [state, exitCode, expected] of [
  ["missing", 0, "completed"],
  ["missing", 1, "completed"],
  ["exited", 0, "completed"],
  ["exited", 1, "completed"],
  ["running", 0, "completed"],
] as const) {
  it(`reconciles existing ${state}/${exitCode} through application lifecycle to ${expected}`, async () => {
    const fake = setup(state);
    if (exitCode) fake.failExit();
    if (state === "missing" && exitCode) fake.fastExit();
    let entity: SyncEntity = {
      id,
      syncRequestId: id,
      entity: "client",
      syncType: "one_time",
      status: "provisioning",
      intervalSeconds: null,
      createdAt: "2026-09-01",
      updatedAt: "2026-09-01",
    };
    const useCase = new ProvisionSyncEntityUseCase(
      {
        getById: async () => entity,
        updateStatus: async (_id, before, after) => {
          assert.equal(before, "provisioning");
          if (entity.status !== before) return false;
          entity = { ...entity, status: after };
          return true;
        },
      },
      {
        getById: async () => ({
          id,
          tenantId: id,
          source: "connectwise",
          target: "keka",
          createdAt: "2026-09-01",
        }),
      },
      { resolve: () => request.imageReference },
      fake.adapter,
      { info: () => undefined, error: () => undefined },
    );
    assert.equal((await useCase.execute(id)).status, expected);
    assert.equal(entity.status, expected);
    assert.deepEqual(
      fake.counts(),
      state === "missing"
        ? { starts: 1, creates: 1, pulls: 1 }
        : { starts: 0, creates: 0, pulls: 0 },
    );
  });
}

it("does not treat an exited container with no proven start as provisioned", async () => {
  const fake = setup("exited");
  fake.unprovenStart();
  await assert.rejects(
    fake.adapter.provision(request),
    RuntimeReconciliationRequiredError,
  );
  assert.deepEqual(fake.counts(), { starts: 0, creates: 0, pulls: 0 });
});
for (const scenario of [
  "ensure-image",
  "create-container",
  "rejected-start",
  "ambiguous-start",
] as const) {
  it(`records ${scenario} with the correct certainty through the application`, async () => {
    const fake = setup(
      "missing",
      scenario === "ensure-image" || scenario === "create-container"
        ? scenario
        : undefined,
    );
    if (scenario === "rejected-start") fake.failStart(400);
    if (scenario === "ambiguous-start") fake.failStart(500);
    let entity: SyncEntity = {
      id,
      syncRequestId: id,
      entity: "client",
      syncType: "one_time",
      status: "provisioning",
      intervalSeconds: null,
      createdAt: "2026-09-21",
      updatedAt: "2026-09-21",
    };
    const useCase = new ProvisionSyncEntityUseCase(
      {
        getById: async () => entity,
        updateStatus: async (_id, before, after) => {
          if (entity.status !== before) return false;
          entity = { ...entity, status: after };
          return true;
        },
      },
      {
        getById: async () => ({
          id,
          tenantId: id,
          source: "connectwise",
          target: "keka",
          createdAt: "2026-09-21",
        }),
      },
      { resolve: () => request.imageReference },
      fake.adapter,
      { info: () => undefined, error: () => undefined },
    );
    await assert.rejects(useCase.execute(id));
    assert.equal(
      entity.status,
      scenario === "ambiguous-start" ? "provisioning" : "failed",
    );
    assert.equal(fake.counts().starts, scenario.endsWith("start") ? 1 : 0);
  });
}

it("retains uncertainty when a rejected start cannot be inspected", async () => {
  const fake = setup("missing", "post-start-inspect");
  fake.failStart(400);
  await assert.rejects(
    fake.adapter.provision(request),
    (error) => error instanceof DependencyError && error.uncertain,
  );
});
