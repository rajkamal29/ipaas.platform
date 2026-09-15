import type { Logger } from "../logging/logger.js";

export class ProvisioningWorker {
  private statusTimer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly logger: Logger,
    private readonly statusLogIntervalMs: number,
  ) {}

  public start(): void {
    if (this.statusTimer !== undefined) {
      return;
    }

    this.logger.info("Node Provisioning Engine is running", {
      statusLogIntervalMs: this.statusLogIntervalMs,
    });

    this.statusTimer = setInterval(() => {
      this.logger.debug("Node Provisioning Engine is healthy");
    }, this.statusLogIntervalMs);
  }

  public stop(): void {
    if (this.statusTimer === undefined) {
      return;
    }

    clearInterval(this.statusTimer);
    this.statusTimer = undefined;
  }
}

