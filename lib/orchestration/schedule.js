/**
 * Sync-type scheduling (Orchestration Engine build plan, Step 4).
 *
 * Wraps runCycle per entity according to its own sync_type:
 *   one_time — run once, then mark completed/failed. Terminal.
 *   interval — mark active, run immediately, then self-reschedule
 *              intervalSeconds after each run FINISHES (not a fixed
 *              setInterval), so a slow cycle never overlaps the next one.
 *   real_time — no execution path yet (no webhook/event layer) — logs
 *               and does nothing else, no status change.
 */
const { runCycle } = require('./cycle');
const { updateEntityStatus } = require('./sync-entities');
const { logger: defaultLogger } = require('../logger');

async function scheduleEntity(entityRow, sourceAdapter, targetAdapter, context, logger = defaultLogger) {
  const log = logger.child({ syncEntityId: entityRow.id, entity: entityRow.entity, syncType: entityRow.syncType });

  if (entityRow.syncType === 'real_time') {
    log.warn('real_time sync_type has no execution path yet — skipping, no status change');
    return;
  }

  if (entityRow.syncType === 'one_time') {
    const result = await runCycle(entityRow, sourceAdapter, targetAdapter, context, logger);
    await updateEntityStatus(entityRow.id, result.success ? 'completed' : 'failed');
    log.info({ status: result.success ? 'completed' : 'failed' }, 'one_time entity finished');
    return;
  }

  if (entityRow.syncType === 'interval') {
    await updateEntityStatus(entityRow.id, 'active');
    const intervalMs = entityRow.intervalSeconds * 1000;

    const loop = async () => {
      try {
        await runCycle(entityRow, sourceAdapter, targetAdapter, context, logger);
      } catch (err) {
        // An unexpected error shouldn't kill future runs for this entity.
        log.error({ err: err.message }, 'unexpected error during interval cycle — continuing schedule');
      }
      setTimeout(loop, intervalMs);
    };
    loop(); // fire and forget — runs for the life of the container
    return;
  }

  log.error({ syncType: entityRow.syncType }, 'unknown sync_type — skipping');
}

module.exports = { scheduleEntity };
