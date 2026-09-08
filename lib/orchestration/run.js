/**
 * Orchestration Engine entrypoint — redesigned 2026-09-08.
 *
 * This is what a container actually runs. One invocation is scoped to
 * exactly one sync_entities row — its ID is the one thing passed in via
 * SYNC_ENTITY_ID; everything else (tenant, source, target, credentials,
 * mapping) is loaded from Postgres from that single identifier.
 *
 * Every invocation runs its one cycle once and exits — there is no more
 * "stay alive for interval entities" branch. Timing (when to invoke this
 * again for an interval entity) is the Provisioning Engine / infra
 * layer's job now, not this process's. See docs/LLD-orchestration-engine.md.
 *
 * Usage: SYNC_ENTITY_ID=<uuid> node lib/orchestration/run.js
 */
require('dotenv').config();

const { loadSyncEntityRun } = require('./bootstrap');
const { createAdapter } = require('./adapter-registry');
const { runEntityOnce } = require('./schedule');
const { logger } = require('../logger');
const { pool } = require('../db');

async function main() {
  const syncEntityId = process.env.SYNC_ENTITY_ID;
  if (!syncEntityId) {
    throw new Error('SYNC_ENTITY_ID env var is required');
  }

  const run = await loadSyncEntityRun(syncEntityId);
  const log = logger.child({ syncEntityId: run.syncEntityId, tenantId: run.tenantId, entity: run.entity });
  log.info({ source: run.source, target: run.target, syncType: run.syncType }, 'starting');

  const sourceAdapter = createAdapter(run.source, run.tenantId);
  const targetAdapter = createAdapter(run.target, run.tenantId);
  const context = { tenantId: run.tenantId, sourceProvider: run.source, targetProvider: run.target };
  const entityRow = {
    id: run.syncEntityId,
    entity: run.entity,
    syncType: run.syncType,
    status: run.status,
    intervalSeconds: run.intervalSeconds,
  };

  await runEntityOnce(entityRow, sourceAdapter, targetAdapter, context, log);

  log.info('run complete — exiting');
  // Close the pool's open sockets before exiting — process.exit() while pg
  // still holds connections open causes a libuv assertion crash on Windows.
  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  logger.error({ err: err.message }, 'orchestration engine failed to start');
  await pool.end().catch(() => {});
  process.exit(1);
});
