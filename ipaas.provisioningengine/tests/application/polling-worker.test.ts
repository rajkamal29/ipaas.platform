import assert from "node:assert/strict";
import { it } from "node:test";
import { setImmediate as settle } from "node:timers/promises";
import { ProvisioningWorker } from "../../src/workers/provisioning-worker.js";
import { DependencyError } from "../../src/application/errors/provisioning-errors.js";
import type { LogContext } from "../../src/application/ports/logger.js";
import { uuid } from "../../src/domain/value-objects/uuid.js";
import { loadPollingOptions } from "../../src/config/polling.js";
const ids = Array.from({ length: 5 }, (_, index) =>
  uuid("10000000-0000-4000-8000-00000000000" + (index + 1)),
);
const options = { intervalMs: 5000, batchSize: 5, maxConcurrency: 2 };
const logger = { info: () => undefined, error: () => undefined };
const result = (id: string) => ({
  syncEntityId: uuid(id),
  status: "provisioning" as const,
  outcome: "started" as const,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("validates bounded polling configuration", () => {
  assert.deepEqual(loadPollingOptions({}), {
    intervalMs: 120000,
    batchSize: 10,
    maxConcurrency: 5,
  });
  for (const [key, min, max] of [
    ["PROVISIONING_POLL_INTERVAL_MS", 1000, 300000],
    ["PROVISIONING_POLL_BATCH_SIZE", 1, 100],
    ["PROVISIONING_MAX_CONCURRENCY", 1, 100],
  ] as const) {
    for (const invalid of [
      "",
      "secret",
      "1.5",
      "-1",
      "Infinity",
      String(min - 1),
      String(max + 1),
    ])
      assert.throws(
        () => loadPollingOptions({ [key]: invalid }),
        (error) => error instanceof Error && !error.message.includes("secret"),
      );
    assert.doesNotThrow(() => loadPollingOptions({ [key]: String(min) }));
    assert.doesNotThrow(() => loadPollingOptions({ [key]: String(max) }));
  }
});
it("explicit identity runs only that entity and never polls", async () => {
  const executed: string[] = [];
  const worker = new ProvisioningWorker(
    {
      execute: async (id) => {
        executed.push(id);
        return result(id);
      },
    },
    {
      claims: {
        claimSubmitted: async () => {
          throw new Error("must not poll");
        },
      },
      options,
      logger,
    },
  );
  await worker.run(ids[0]!);
  await worker.stop();
  assert.deepEqual(executed, [ids[0]]);
});
it(
  "absent identity polls again only after the empty-batch delay and wakes on stop",
  { timeout: 2000 },
  async () => {
    let claims = 0;
    let pauses = 0;
    const tick = deferred<void>();
    const worker = new ProvisioningWorker(
      { execute: async (id) => result(id) },
      {
        claims: {
          claimSubmitted: async (limit) => {
            assert.equal(limit, 5);
            claims++;
            return [];
          },
        },
        options,
        logger,
      },
      async (ms, signal) => {
        assert.equal(ms, 5000);
        pauses++;
        if (pauses === 1) await tick.promise;
        else
          await new Promise<void>((done) =>
            signal.addEventListener("abort", () => done(), { once: true }),
          );
      },
    );
    const running = worker.run();
    await settle();
    assert.equal(claims, 1);
    assert.equal(pauses, 1);
    tick.resolve();
    await settle();
    assert.equal(claims, 2);
    assert.equal(pauses, 2);
    await worker.stop();
    await running;
    assert.equal(claims, 2);
  },
);
it(
  "bounds concurrency, isolates item failure, prevents overlapping cycles and drains committed work",
  { timeout: 2000 },
  async () => {
    const gates = ids.map(() => deferred<void>());
    const executed: string[] = [];
    let active = 0;
    let peak = 0;
    let claims = 0;
    let pauses = 0;
    const failures: LogContext[] = [];
    const worker = new ProvisioningWorker(
      {
        execute: async (id) => {
          const index = ids.indexOf(uuid(id));
          executed.push(id);
          active++;
          peak = Math.max(peak, active);
          try {
            await gates[index]!.promise;
            if (index === 0) throw new Error("private detail");
            return result(id);
          } finally {
            active--;
          }
        },
      },
      {
        claims: {
          claimSubmitted: async () => {
            claims++;
            return ids;
          },
        },
        options,
        logger: {
          info: () => undefined,
          error: (_message, context) => failures.push(context ?? {}),
        },
      },
      async () => {
        pauses++;
      },
    );
    const running = worker.run();
    await settle();
    assert.equal(executed.length, 2);
    assert.equal(claims, 1);
    assert.equal(pauses, 0);
    gates[0]!.resolve();
    await settle();
    assert.equal(executed.length, 3);
    assert.equal(peak, 2);
    let drained = false;
    const stopping = worker.stop().then(() => {
      drained = true;
    });
    await settle();
    assert.equal(drained, false);
    for (const gate of gates) gate.resolve();
    await stopping;
    await running;
    assert.equal(executed.length, 5);
    assert.equal(peak, 2);
    assert.equal(claims, 1);
    assert.equal(pauses, 0);
    assert.equal(failures[0]?.syncEntityId, ids[0]);
    assert.ok(!JSON.stringify(failures).includes("private detail"));
    await assert.rejects(worker.submit(ids[0]!));
    assert.throws(() => worker.start());
  },
);
it(
  "stop during a claim waits for the transaction and processes its committed ids",
  { timeout: 2000 },
  async () => {
    const claim = deferred<readonly ReturnType<typeof uuid>[]>();
    let calls = 0;
    const executed: string[] = [];
    const worker = new ProvisioningWorker(
      {
        execute: async (id) => {
          executed.push(id);
          return result(id);
        },
      },
      {
        claims: {
          claimSubmitted: async () => {
            calls++;
            return claim.promise;
          },
        },
        options,
        logger,
      },
    );
    const running = worker.run();
    const stopped = worker.stop();
    assert.equal(worker.stop(), stopped);
    let done = false;
    void stopped.then(() => {
      done = true;
    });
    await settle();
    assert.equal(done, false);
    claim.resolve(ids);
    await stopped;
    await running;
    assert.deepEqual(executed.sort(), [...ids].sort());
    assert.equal(calls, 1);
  },
);
it(
  "claim errors wait before the next cycle and do not terminate polling",
  { timeout: 2000 },
  async () => {
    let claims = 0;
    const tick = deferred<void>();
    const logs: LogContext[] = [];
    const handled = deferred<void>();
    const worker = new ProvisioningWorker(
      {
        execute: async (id) => {
          handled.resolve();
          return result(id);
        },
      },
      {
        claims: {
          claimSubmitted: async () => {
            if (++claims === 1)
              throw new DependencyError("database", false, {
                dependency: "postgres",
                operation: "claim-submitted",
              });
            return [ids[0]!];
          },
        },
        options,
        logger: {
          info: () => undefined,
          error: (_message, context) => logs.push(context ?? {}),
        },
      },
      async (_ms, signal) => {
        if (claims === 1) await tick.promise;
        else
          await new Promise<void>((done) => {
            if (signal.aborted) done();
            else signal.addEventListener("abort", () => done(), { once: true });
          });
      },
    );
    const running = worker.run();
    await settle();
    assert.equal(claims, 1);
    tick.resolve();
    await handled.promise;
    await worker.stop();
    await running;
    assert.equal(claims, 2);
    assert.equal(logs[0]?.operation, "claim-submitted");
  },
);
it(
  "stop interrupts the real idle timer rather than waiting a full poll interval",
  { timeout: 1000 },
  async () => {
    const worker = new ProvisioningWorker(
      { execute: async (id) => result(id) },
      {
        claims: { claimSubmitted: async () => [] },
        options: { ...options, intervalMs: 300000 },
        logger,
      },
    );
    const running = worker.run();
    await settle();
    await worker.stop();
    await running;
  },
);

for (const claimed of [[], [ids[0]!]]) {
  it(`logs poll completion with claimedCount=${claimed.length} and graceful shutdown`, async () => {
    const logs: { message: string; context: LogContext }[] = [];
    const idle = deferred<void>();
    const worker = new ProvisioningWorker(
      { execute: async (id) => result(id) },
      {
        claims: { claimSubmitted: async () => claimed },
        options,
        logger: {
          info: (message, context) => {
            logs.push({ message, context: context ?? {} });
          },
          error: () => assert.fail("Unexpected failure"),
        },
      },
      async (_ms, signal) => {
        idle.resolve();
        await new Promise<void>((done) => {
          if (signal.aborted) done();
          else signal.addEventListener("abort", () => done(), { once: true });
        });
      },
    );
    const running = worker.run();
    await idle.promise;
    await worker.stop();
    await running;
    assert.deepEqual(
      logs
        .filter((log) => log.message === "Provisioning poll completed")
        .map((log) => log.context),
      [{ claimedCount: claimed.length }],
    );
    assert.equal(
      logs.filter((log) => log.message === "Provisioning poll started").length,
      1,
    );
    assert.equal(
      logs.filter((log) => log.message === "Provisioning batch drained").length,
      claimed.length,
    );
    assert.deepEqual(
      logs.slice(-2).map((log) => log.message),
      ["Provisioning worker stopping", "Provisioning worker stopped"],
    );
  });
}
it("explicit execution reports a persisted failed runtime as failure", async () => {
  const worker = new ProvisioningWorker({
    execute: async (id) => ({
      syncEntityId: uuid(id),
      status: "failed",
      outcome: "failed",
    }),
  });
  await assert.rejects(worker.run(ids[0]), /Provisioning failed/);
  await worker.stop();
});
