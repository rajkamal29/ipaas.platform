/**
 * Per-entity run policy — redesigned 2026-09-08.
 *
 * Timing (when to run) is no longer this engine's job — it moved to the
 * Provisioning Engine / infra layer, which now invokes this container once
 * per attempt for a given sync_entities row (a one-shot Job for one_time,
 * a recurring trigger for interval, matching sync_entities.interval_seconds).
 * This module's only remaining job is: run one cycle, then decide what
 * sync_entities.status should become as a result.
 *
 *   one_time — terminal. A failed cycle sets status='failed'; nothing
 *              retries it automatically.
 *   interval — status is set to 'active' before the attempt and left
 *              alone regardless of the cycle's outcome. A failed run does
 *              NOT flip status to 'failed', deliberately: infra will
 *              trigger the next attempt on its own schedule either way,
 *              and 'failed' would misleadingly read as "stopped" for
 *              something that's still a live recurring sync. The failure
 *              itself is visible via sync_state.last_run_status/last_error,
 *              not sync_entities.status.
 *   real_time — out of scope for this engine entirely. Routing a
 *               real_time entity here is an infra mistake, not something
 *               to silently tolerate — see the separate, not-yet-built
 *               webhook/queue engine this belongs to instead.
 */
const { runCycle } = require('./cycle');
const { updateEntityStatus } = require('./sync-entities');
const { logger: defaultLogger } = require('../logger');

async function runEntityOnce(entityRow, sourceAdapter, targetAdapter, context, logger = defaultLogger) {
  const log = logger.child({ syncEntityId: entityRow.id, entity: entityRow.entity, syncType: entityRow.syncType });

  if (entityRow.syncType === 'one_time') {
    const result = await runCycle(entityRow, sourceAdapter, targetAdapter, context, logger);
    await updateEntityStatus(entityRow.id, result.success ? 'completed' : 'failed');
    log.info({ status: result.success ? 'completed' : 'failed' }, 'one_time entity finished');
    return result;
  }

  if (entityRow.syncType === 'interval') {
    await updateEntityStatus(entityRow.id, 'active');
    const result = await runCycle(entityRow, sourceAdapter, targetAdapter, context, logger);
    log.info(
      { success: result.success, failedCount: result.failedCount, retryCount: result.retryCount },
      'interval entity run finished — status stays active regardless of outcome, see sync_state for this run\'s result'
    );
    return result;
  }

  throw new Error(
    `Unsupported sync_type "${entityRow.syncType}" for the batch Orchestration Engine — ` +
    'real_time entities belong to a separate engine, not this one.'
  );
}

module.exports = { runEntityOnce };
