/**
 * Orchestration Engine entrypoint.
 *
 * A process invocation performs one database-driven orchestration run:
 *
 *   1. Load every tenant from `tenants`.
 *   2. Load that tenant's `sync_entities` rows through `sync_requests`, which
 *      supplies the tenant and source/target provider context for each row.
 *   3. Build the adapters and run the existing per-entity policy once for
 *      every returned row.
 *
 * The sync entity ID used by the cycle, sync-state writes, status updates,
 * and logs is always `sync_entities.id` returned by Postgres.
 * A tenant with no configured sync entities is logged and skipped without
 * affecting the remaining tenants in the sweep.
 *
 * Every invocation runs its one cycle once and exits — there is no more
 * "stay alive for interval entities" branch. Timing (when to invoke this
 * again for an interval entity) is the Provisioning Engine / infra
 * layer's job now, not this process's. See docs/LLD-orchestration-engine.md.
 *
 * Usage: SYNC_ENTITY_ID=<uuid> node lib/orchestration/run.js
 */
require('dotenv').config();

const { loadAllTenants, loadSyncEntityRunsForTenant } = require('./bootstrap');
const { createAdapter } = require('./adapter-registry');
const { runEntityOnce } = require('./schedule');
const { logger } = require('../logger');
const { pool } = require('../db');

async function main() {
  const tenants = await loadAllTenants();
  for (const tenant of tenants) {
    const runs = await loadSyncEntityRunsForTenant(tenant.id);
    if (runs.length === 0) {
      logger.info({ tenantId: tenant.id }, 'tenant has no sync entities — skipping');
      continue;
    }

    for (const run of runs) {
      const log = logger.child({ syncEntityId: run.syncEntityId, tenantId: run.tenantId, entity: run.entity });
      log.info({ source: run.source, target: run.target, syncType: run.syncType }, 'starting');

      const sourceAdapter = await createAdapter(run.source, run.tenantId, log);
      const targetAdapter = await createAdapter(run.target, run.tenantId, log);
      const context = { tenantId: run.tenantId, sourceProvider: run.source, targetProvider: run.target };
      const entityRow = {
        id: run.syncEntityId,
        entity: run.entity,
        syncType: run.syncType,
        status: run.status,
        intervalSeconds: run.intervalSeconds,
      };

      await runEntityOnce(entityRow, sourceAdapter, targetAdapter, context, log);
      log.info('run complete');
    }
  }

  logger.info({ tenantCount: tenants.length }, 'orchestration complete — exiting');
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
