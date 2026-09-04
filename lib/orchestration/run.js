/**
 * Orchestration Engine entrypoint (build plan, Step 5).
 *
 * This is what a container actually runs. One container is scoped to
 * exactly one sync_requests row (2026-09-01 design discussion) — its ID
 * is the one thing passed in via SYNC_REQUEST_ID; everything else
 * (tenant, source, target, entities, credentials) is loaded from Postgres
 * from that single identifier.
 *
 * Usage: SYNC_REQUEST_ID=<uuid> node lib/orchestration/run.js
 */
require('dotenv').config();

const { loadSyncRequest } = require('./bootstrap');
const { createAdapter } = require('./adapter-registry');
const { scheduleEntity } = require('./schedule');
const { logger } = require('../logger');
const { pool } = require('../db');

async function main() {
  const syncRequestId = process.env.SYNC_REQUEST_ID;
  if (!syncRequestId) {
    throw new Error('SYNC_REQUEST_ID env var is required');
  }

  const request = await loadSyncRequest(syncRequestId);
  const log = logger.child({ syncRequestId: request.syncRequestId, tenantId: request.tenantId });
  log.info({ source: request.source, target: request.target, entities: request.entities.map((e) => e.entity) }, 'starting');

  const sourceAdapter = createAdapter(request.source, request.tenantId);
  const targetAdapter = createAdapter(request.target, request.tenantId);
  const context = { tenantId: request.tenantId, sourceProvider: request.source, targetProvider: request.target };

  await Promise.all(
    request.entities.map((entityRow) => scheduleEntity(entityRow, sourceAdapter, targetAdapter, context, log))
  );

  const hasRecurring = request.entities.some((e) => e.syncType === 'interval');
  if (!hasRecurring) {
    log.info('every entity is terminal (one_time/real_time only) — nothing left to run, exiting');
    // Close the pool's open sockets before exiting — process.exit() while
    // pg still holds connections open causes a libuv assertion crash on
    // Windows (harmless to data, but shouldn't be left as-is).
    await pool.end();
    process.exit(0);
  }
  // Any interval entity has already scheduled its own recurring loop
  // (see schedule.js) — that loop's pending setTimeout keeps this process
  // alive on its own; nothing more to do here, and the pool must stay
  // open since those loops keep querying Postgres.
  log.info('at least one interval entity is running — staying alive');
}

main().catch(async (err) => {
  logger.error({ err: err.message }, 'orchestration engine failed to start');
  await pool.end().catch(() => {});
  process.exit(1);
});
