import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProvisionSyncEntityUseCase } from "../../src/application/use-cases/provision-sync-entity.js";
import {
  ApplicationError,
  DependencyError,
  ProvisioningFailedError,
  RuntimeImageNotFoundError,
  SyncEntityNotFoundError,
  SyncRequestNotFoundError,
  UnsupportedSyncTypeError,
} from "../../src/application/errors/provisioning-errors.js";
import type { SyncEntity } from "../../src/domain/entities/sync-entity.js";
import type { SyncRequest } from "../../src/domain/entities/sync-request.js";
import { uuid } from "../../src/domain/value-objects/uuid.js";
import type {
  RuntimeRequest,
  RuntimeResult,
} from "../../src/application/dto/provisioning.js";
import type { SyncEntityStatus } from "../../src/domain/enums/platform-values.js";
import type { LogContext } from "../../src/application/ports/logger.js";
import { ProvisioningWorker } from "../../src/workers/provisioning-worker.js";

const id = uuid("10000000-0000-4000-8000-000000000001");
const requestId = uuid("20000000-0000-4000-8000-000000000001");
const timestamp = "2026-09-01T00:00:00.000Z";
const seed: SyncEntity = {
  id,
  syncRequestId: requestId,
  entity: "client",
  syncType: "one_time",
  status: "provisioning",
  intervalSeconds: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const parent: SyncRequest = {
  id: requestId,
  tenantId: uuid("30000000-0000-4000-8000-000000000001"),
  source: "connectwise",
  target: "keka",
  createdAt: timestamp,
};

function setup(initial: SyncEntity | null = seed) {
  let entity = initial;
  let request: SyncRequest | null = parent;
  let statusFailure = false;
  let readFailureAfterLaunch = false;
  let launched = false;
  const calls: RuntimeRequest[] = [];
  const errors: LogContext[] = [];
  const logs: { message: string; context: LogContext }[] = [];
  const transitions: [SyncEntityStatus, SyncEntityStatus][] = [];
  const parentLookups: string[] = [];
  const imageLookups: string[][] = [];
  let result: RuntimeResult = { kind: "started", reference: "runtime" };
  let runtimeFailure: Error | undefined;
  let imageFailure = false;
  let completeDuringLaunch = false;
  const useCase = new ProvisionSyncEntityUseCase(
    {
      getById: async () => {
        if (launched && readFailureAfterLaunch)
          throw new DependencyError("database");
        return entity;
      },
      updateStatus: async (_id, expected, next) => {
        if (statusFailure) throw new DependencyError("database");
        transitions.push([expected, next]);
        if (entity?.status !== expected) return false;
        entity = { ...entity, status: next };
        return true;
      },
    },
    {
      getById: async (id) => {
        parentLookups.push(id);
        return request;
      },
    },
    {
      resolve: (source, target) => {
        imageLookups.push([source, target]);
        if (imageFailure) throw new RuntimeImageNotFoundError();
        return "ghcr.io/test/runtime:v1";
      },
    },
    {
      provision: async (input) => {
        calls.push(input);
        if (completeDuringLaunch && entity)
          entity = { ...entity, status: "completed" };
        if (runtimeFailure) throw runtimeFailure;
        launched = true;
        return result;
      },
    },
    {
      info: (message, context) => {
        logs.push({ message, context: context ?? {} });
      },
      error: (_message, context) => {
        errors.push(context ?? {});
      },
    },
  );
  return {
    useCase,
    errors,
    logs,
    calls,
    transitions,
    parentLookups,
    imageLookups,
    current: () => entity,
    completeDuringLaunch: () => {
      completeDuringLaunch = true;
    },
    setParent: (value: SyncRequest | null) => {
      request = value;
    },
    setResult: (value: RuntimeResult) => {
      result = value;
    },
    failRuntime: (value: Error) => {
      runtimeFailure = value;
    },
    failStatus: () => {
      statusFailure = true;
    },
    failPostLaunchRead: () => {
      readFailureAfterLaunch = true;
    },
    failImage: () => {
      imageFailure = true;
    },
  };
}
describe("ProvisionSyncEntityUseCase", () => {
  it("loads the parent, resolves approved providers, and provisions using only entity identity", async () => {
    const fake = setup();
    const result = await fake.useCase.execute(id);
    assert.deepEqual(fake.parentLookups, [requestId]);
    assert.deepEqual(fake.imageLookups, [["connectwise", "keka"]]);
    assert.deepEqual(fake.calls, [
      {
        syncEntityId: id,
        imageReference: "ghcr.io/test/runtime:v1",
        syncType: "one_time",
        intervalSeconds: null,
      },
    ]);
    assert.equal(result.status, "provisioning");
    assert.equal(result.outcome, "started");
    assert.deepEqual(fake.transitions, []);
  });
  it("sets interval active only after recurring infrastructure is confirmed", async () => {
    const fake = setup({ ...seed, syncType: "interval", intervalSeconds: 60 });
    fake.setResult({ kind: "recurring-ready", reference: "schedule" });
    assert.equal((await fake.useCase.execute(id)).status, "active");
    assert.deepEqual(fake.transitions, [["provisioning", "active"]]);
  });
  it("does not mistake accepted deployment for an active schedule", async () => {
    const fake = setup({ ...seed, syncType: "interval", intervalSeconds: 60 });
    fake.setResult({ kind: "accepted", reference: "dispatch" });
    assert.equal((await fake.useCase.execute(id)).status, "provisioning");
  });
  it("completes one-time execution after a definitive zero exit", async () => {
    const fake = setup();
    fake.setResult({
      kind: "exited",
      reference: "runtime",
      runtimeName: `ipaas-sync-${id}`,
      runtimeState: "exited",
      exitCode: 0,
    });
    assert.equal((await fake.useCase.execute(id)).status, "completed");
  });
  it("rejects real-time without resolving or launching a batch image", async () => {
    const fake = setup({ ...seed, syncType: "real_time" });
    await assert.rejects(fake.useCase.execute(id), UnsupportedSyncTypeError);
    assert.equal(fake.current()?.status, "failed");
    assert.equal(fake.calls.length, 0);
  });
  it("rejects missing entity and parent records", async () => {
    await assert.rejects(
      setup(null).useCase.execute(id),
      SyncEntityNotFoundError,
    );
    const fake = setup();
    fake.setParent(null);
    await assert.rejects(fake.useCase.execute(id), SyncRequestNotFoundError);
  });
  it("handles missing runtime image and definitive runtime failures", async () => {
    const missing = setup();
    missing.failImage();
    await assert.rejects(
      missing.useCase.execute(id),
      RuntimeImageNotFoundError,
    );
    const failed = setup();
    failed.failRuntime(new DependencyError("runtime"));
    await assert.rejects(failed.useCase.execute(id), ProvisioningFailedError);
    assert.equal(failed.current()?.status, "failed");
  });
  it("preserves provisioning for uncertain dispatch and post-launch database failures", async () => {
    const uncertain = setup();
    uncertain.failRuntime(new DependencyError("runtime", true));
    await assert.rejects(
      uncertain.useCase.execute(id),
      ProvisioningFailedError,
    );
    assert.equal(uncertain.current()?.status, "provisioning");
    const readFailure = setup();
    readFailure.failPostLaunchRead();
    await assert.rejects(
      readFailure.useCase.execute(id),
      ProvisioningFailedError,
    );
    assert.deepEqual(readFailure.transitions, []);
  });
  it("reports status persistence failure without leaking driver error text", async () => {
    const fake = setup();
    fake.failRuntime(new DependencyError("runtime"));
    fake.failStatus();
    await assert.rejects(
      fake.useCase.execute(id),
      (error: unknown) =>
        error instanceof ProvisioningFailedError && !error.statusRecorded,
    );
  });
  it("does not claim submitted or retry failed entities automatically", async () => {
    for (const status of ["submitted", "failed"] as const) {
      const fake = setup({ ...seed, status });
      await assert.rejects(fake.useCase.execute(id), ApplicationError);
      assert.deepEqual(fake.transitions, []);
      assert.equal(fake.calls.length, 0);
    }
  });
  it("returns predictably for already active/completed entities", async () => {
    for (const status of ["active", "completed"] as const) {
      const fake = setup({ ...seed, status });
      assert.equal(
        (await fake.useCase.execute(id)).outcome,
        "already-provisioned",
      );
      assert.equal(fake.calls.length, 0);
    }
  });
  it("rejects malformed IDs before repository access", async () => {
    const fake = setup();
    await assert.rejects(fake.useCase.execute("not-a-uuid"));
    assert.deepEqual(fake.parentLookups, []);
  });
});
describe("Explicit provisioning worker", () => {
  it("deduplicates in-flight work and drains it during idempotent stop", async () => {
    let resolve!: (
      value: Awaited<ReturnType<ProvisionSyncEntityUseCase["execute"]>>,
    ) => void;
    let calls = 0;
    const worker = new ProvisioningWorker({
      execute: () => {
        calls++;
        return new Promise((done) => {
          resolve = done;
        });
      },
    });
    worker.start();
    const first = worker.submit(id);
    const second = worker.submit(id);
    assert.equal(first, second);
    assert.equal(calls, 1);
    const stopped = worker.stop();
    await assert.rejects(worker.submit(id), ApplicationError);
    resolve({ syncEntityId: id, status: "provisioning", outcome: "started" });
    await Promise.all([first, stopped, worker.stop()]);
  });
});

it("preserves a concurrent terminal transition", async () => {
  const successful = setup();
  successful.completeDuringLaunch();
  assert.equal((await successful.useCase.execute(id)).status, "completed");
  const failure = setup();
  failure.completeDuringLaunch();
  failure.failRuntime(new DependencyError("runtime"));
  await assert.rejects(failure.useCase.execute(id), ProvisioningFailedError);
  assert.equal(failure.current()?.status, "completed");
});

it("preserves dependency diagnostics and entity correlation in application failure logs", async () => {
  const fake = setup();
  fake.failRuntime(
    new DependencyError("runtime", true, {
      dependency: "github",
      operation: "workflow-dispatch",
      httpStatus: 503,
    }),
  );
  await assert.rejects(fake.useCase.execute(id), ProvisioningFailedError);
  assert.deepEqual(fake.errors[0], {
    syncEntityId: id,
    failureCode: "dependency-failed",
    dependency: "github",
    operation: "workflow-dispatch",
    httpStatus: 503,
    statusRecorded: false,
    uncertain: true,
    previousStatus: "provisioning",
  });
});

it("claimed unsupported types fail once without activating or requeueing", async () => {
  for (const syncType of ["real_time", "interval"] as const) {
    const fake = setup({
      ...seed,
      syncType,
      intervalSeconds: syncType === "interval" ? 60 : null,
    });
    if (syncType === "interval")
      fake.failRuntime(new UnsupportedSyncTypeError(syncType));
    await assert.rejects(fake.useCase.execute(id), UnsupportedSyncTypeError);
    assert.equal(fake.current()?.status, "failed");
    assert.deepEqual(fake.transitions, [["provisioning", "failed"]]);
    // The next explicit invocation cannot accidentally retry a failed entity.
    const launches = fake.calls.length;
    await assert.rejects(
      fake.useCase.execute(id),
      (error) =>
        error instanceof ApplicationError &&
        error.code === "entity-not-provisioning",
    );
    assert.equal(fake.calls.length, launches);
  }
});

for (const exitCode of [0, 1]) {
  it(
    "records definitive exit " +
      exitCode +
      " conditionally with safe runtime context",
    async () => {
      const fake = setup();
      fake.setResult({
        kind: "exited",
        reference: "runtime",
        runtimeName: `ipaas-sync-${id}`,
        runtimeState: "exited",
        exitCode,
      });
      const result = await fake.useCase.execute(id);
      const next = exitCode === 0 ? "completed" : "failed";
      assert.equal(result.status, next);
      assert.equal(result.outcome, next);
      assert.deepEqual(fake.transitions, [["provisioning", next]]);
      const log = fake.logs.find(
        (x) => x.message === "Runtime reconciliation completed",
      )!;
      assert.equal(log.context.exitCode, exitCode);
      assert.equal(log.context.nextStatus, next);
      assert.equal(log.context.syncEntityId, id);
      assert.equal(log.context.uncertain, false);
    },
  );
}
it("does not overwrite a concurrent terminal status after definitive runtime exit", async () => {
  const fake = setup();
  fake.completeDuringLaunch();
  fake.setResult({
    kind: "exited",
    reference: "runtime",
    runtimeName: `ipaas-sync-${id}`,
    runtimeState: "exited",
    exitCode: 1,
  });
  assert.equal((await fake.useCase.execute(id)).status, "completed");
  assert.equal(
    fake.logs.find((x) => x.message === "Provisioning status transition")
      ?.context.statusRecorded,
    false,
  );
});
it("logs reconciliation-required for uncertain Docker outcomes without a terminal transition", async () => {
  const fake = setup();
  fake.failRuntime(
    new DependencyError("runtime", true, {
      dependency: "docker",
      operation: "wait-container",
    }),
  );
  await assert.rejects(fake.useCase.execute(id), ProvisioningFailedError);
  assert.equal(fake.current()?.status, "provisioning");
  assert.deepEqual(fake.transitions, []);
  assert.equal(
    fake.logs.find((x) => x.message === "Runtime reconciliation required")
      ?.context.uncertain,
    true,
  );
});
it("GitHub acceptance is not one-time completion", async () => {
  const fake = setup();
  fake.setResult({ kind: "accepted", reference: "dispatch" });
  assert.equal((await fake.useCase.execute(id)).status, "provisioning");
  assert.deepEqual(fake.transitions, []);
  assert.ok(fake.logs.some((x) => x.message === "GitHub dispatch accepted"));
});

it("explicit worker rejects a failed runtime even when a concurrent completed status is preserved", async () => {
  const fake = setup();
  assert.equal(fake.current()?.status, "provisioning");
  fake.completeDuringLaunch();
  fake.setResult({
    kind: "exited",
    reference: "runtime",
    runtimeName: `ipaas-sync-${id}`,
    runtimeState: "exited",
    exitCode: 1,
  });
  const worker = new ProvisioningWorker({
    execute: async (syncEntityId) => {
      const result = await fake.useCase.execute(syncEntityId);
      assert.equal(result.status, "completed");
      assert.equal(result.outcome, "failed");
      return result;
    },
  });
  try {
    await assert.rejects(worker.run(id), ProvisioningFailedError);
    assert.equal(fake.current()?.status, "completed");
    assert.deepEqual(fake.transitions, [["provisioning", "failed"]]);
    assert.equal(fake.calls.length, 1);
    assert.equal(
      fake.logs.find(
        (entry) => entry.message === "Provisioning status transition",
      )?.context.statusRecorded,
      false,
    );
  } finally {
    await worker.stop();
  }
});
