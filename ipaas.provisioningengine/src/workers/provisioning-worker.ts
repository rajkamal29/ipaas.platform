import type { ProvisionSyncEntityUseCase } from "../application/use-cases/provision-sync-entity.js";
import type { ProvisioningResult } from "../application/dto/provisioning.js";
import { ApplicationError } from "../application/errors/provisioning-errors.js";
import { uuid } from "../domain/value-objects/uuid.js";
export class ProvisioningWorker {
  private accepting = false;
  private readonly pending = new Map<string, Promise<ProvisioningResult>>();
  constructor(
    private readonly provision: Pick<ProvisionSyncEntityUseCase, "execute">,
  ) {}
  start(): void {
    this.accepting = true;
  }
  submit(syncEntityId: string): Promise<ProvisioningResult> {
    if (!this.accepting)
      return Promise.reject(
        new ApplicationError("worker-stopped", "Worker is not accepting work."),
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
  async stop(): Promise<void> {
    this.accepting = false;
    await Promise.allSettled(this.pending.values());
  }
}
