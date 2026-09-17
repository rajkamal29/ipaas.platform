import { setTimeout as delay } from "node:timers/promises";
import type { ProvisionSyncEntityUseCase } from "../application/use-cases/provision-sync-entity.js";
import type { ProvisioningResult } from "../application/dto/provisioning.js";
import type { SyncEntityClaimRepository } from "../application/ports/repositories/sync-entity-claim-repository.js";
import type { Logger } from "../application/ports/logger.js";
import {
  ApplicationError,
  ProvisioningFailedError,
  DependencyError,
  failureDiagnostics,
} from "../application/errors/provisioning-errors.js";
import { uuid, type Uuid } from "../domain/value-objects/uuid.js";
import type { PollingOptions } from "../config/polling.js";

interface PollingDependencies {
  readonly claims: SyncEntityClaimRepository;
  readonly options: PollingOptions;
  readonly logger: Logger;
}
type Wait = (milliseconds: number, signal: AbortSignal) => Promise<void>;
const wait: Wait = (milliseconds, signal) =>
  delay(milliseconds, undefined, { signal });

export class ProvisioningWorker {
  private accepting = false;
  private stopped = false;
  private readonly pending = new Map<string, Promise<ProvisioningResult>>();
  private readonly cancellation = new AbortController();
  private pollingLoop: Promise<void> | undefined;
  private shutdown: Promise<void> | undefined;
  constructor(
    private readonly provision: Pick<ProvisionSyncEntityUseCase, "execute">,
    private readonly polling?: PollingDependencies,
    private readonly pause: Wait = wait,
  ) {}
  start(): void {
    if (this.stopped)
      throw new ApplicationError(
        "worker-stopped",
        "Worker cannot restart after shutdown.",
      );
    this.accepting = true;
  }
  /** Explicit identity is exclusive with polling and still requires a claimed row. */
  async run(syncEntityId?: Uuid): Promise<void> {
    if (this.accepting)
      throw new ApplicationError(
        "worker-running",
        "Worker is already running.",
      );
    this.start();
    if (syncEntityId) {
      const result = await this.submit(syncEntityId);
      if (result.status === "failed")
        throw new ProvisioningFailedError("runtime-exited", true, false);
      return;
    }
    if (!this.polling)
      throw new ApplicationError(
        "polling-not-configured",
        "Polling dependencies are required.",
      );
    this.pollingLoop = this.poll(this.polling);
    await this.pollingLoop;
  }
  submit(syncEntityId: string): Promise<ProvisioningResult> {
    if (!this.accepting || this.pollingLoop)
      return Promise.reject(
        new ApplicationError(
          "worker-stopped",
          "Worker is not accepting explicit work.",
        ),
      );
    const id = uuid(syncEntityId);
    const existing = this.pending.get(id);
    if (existing) return existing;
    const operation = this.provision.execute(id);
    this.pending.set(id, operation);
    void operation.then(
      () => this.pending.delete(id),
      () => this.pending.delete(id),
    );
    return operation;
  }
  private async poll({
    claims,
    options,
    logger,
  }: PollingDependencies): Promise<void> {
    logger.info("Polling worker started");
    while (this.accepting) {
      logger.info("Provisioning poll started", {
        batchSize: options.batchSize,
      });
      try {
        const ids = await claims.claimSubmitted(options.batchSize);
        logger.info("Provisioning poll completed", {
          claimedCount: ids.length,
        });
        if (ids.length) {
          logger.info("Provisioning batch claimed", {
            claimedCount: ids.length,
          });
          let next = 0;
          const consume = async (): Promise<void> => {
            while (next < ids.length) {
              const id = ids[next++]!;
              try {
                await this.provision.execute(id);
              } catch (error: unknown) {
                logger.error("Claimed entity failed", {
                  syncEntityId: id,
                  failureCode:
                    error instanceof ApplicationError
                      ? error.code
                      : "unexpected-failure",
                  ...failureDiagnostics(error),
                });
              }
            }
          };
          // Drain every committed claim even after stop; consumer count is bounded.
          await Promise.all(
            Array.from(
              { length: Math.min(options.maxConcurrency, ids.length) },
              consume,
            ),
          );
          logger.info("Provisioning batch drained", {
            claimedCount: ids.length,
          });
        }
      } catch (error: unknown) {
        logger.error("Provisioning poll completed", {
          outcome: "claim-failed",
          ...failureDiagnostics(error),
          uncertain: error instanceof DependencyError && error.uncertain,
          failureCode:
            error instanceof ApplicationError
              ? error.code
              : "unexpected-failure",
        });
      }
      if (!this.accepting) break;
      try {
        await this.pause(options.intervalMs, this.cancellation.signal);
      } catch (error: unknown) {
        if (!this.cancellation.signal.aborted) throw error;
      }
    }
  }
  stop(): Promise<void> {
    this.shutdown ??= (async () => {
      this.accepting = false;
      this.stopped = true;
      this.cancellation.abort();
      this.polling?.logger.info("Provisioning worker stopping");
      try {
        await this.pollingLoop;
      } finally {
        await Promise.allSettled(this.pending.values());
        this.polling?.logger.info("Provisioning worker stopped");
      }
    })();
    return this.shutdown;
  }
}
