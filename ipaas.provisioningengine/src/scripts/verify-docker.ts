import { loadConfig } from "../config/environment.js";
import { composeApplication } from "../bootstrap.js";
const config = loadConfig();
if (!config.allowLiveVerification)
  throw new Error(
    "Set RUN_LIVE_VERIFICATION=true for explicit live verification.",
  );
if (config.runtime.kind !== "docker" || !config.syncEntityId)
  throw new Error(
    "Docker verification requires RUNTIME_PROVIDER=docker and a real SYNC_ENTITY_ID in provisioning status.",
  );
const app = await composeApplication(config);
try {
  app.worker.start();
  console.log(await app.worker.submit(config.syncEntityId));
} finally {
  await app.shutdown();
}
