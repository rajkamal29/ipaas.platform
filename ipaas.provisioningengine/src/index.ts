import { composeApplication } from "./bootstrap.js";

const { logger, worker } = composeApplication();

worker.start();

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info("Node Provisioning Engine is stopping", { signal });
  worker.stop();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

