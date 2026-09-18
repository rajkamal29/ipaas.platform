/**
 * Per-entity run policy — redesigned 2026-09-08, narrowed further the
 * same day.
 *
 * Timing (when to run) is no longer this engine's job — it moved to the
 * Provisioning Engine / infra layer, which now invokes this container once
 * per attempt for a given sync_entities row (a one-shot Job for one_time,
 * a recurring trigger for interval, matching sync_entities.interval_seconds).
 *
 * This module's job is now just: run one cycle, and — ONLY for one_time,
 * where the outcome is genuinely terminal and only this engine can know
 * it — record that outcome as sync_entities.status.
 *
 *   one_time — terminal. This is the one case where sync_entities.status
 *              is this engine's to set: a failed cycle sets status='failed',
 *              a successful one sets 'completed'. Nothing retries it
 *              automatically.
 *   interval — sync_entities.status is NOT touched here at all anymore.
 *              Whether this entity is 'active' is a lifecycle fact the
 *              Provisioning Engine owns (set once, when it first sets up
 *              the recurring trigger) — not something this engine should
 *              reassert on every invocation, the same way it no longer
 *              owns timing. This run's actual outcome is fully captured
 *              in sync_state.last_run_status/last_error, which is already
 *              the correct source of truth for "how did this run go."
 *   real_time — out of scope for this engine entirely. Routing a
 *               real_time entity here is an infra mistake, not something
 *               to silently tolerate — see the separate, not-yet-built
 *               webhook/queue engine this belongs to instead.
 */
const { runCycle } = require('./cycle');
const { logger: defaultLogger } = require('../logger');

async function runEntityOnce(entityRow, sourceAdapter, targetAdapter, context, logger = defaultLogger) {
  const log = logger;

  if (entityRow.syncType === 'one_time') {
    const result = await runCycle(entityRow, sourceAdapter, targetAdapter, context, logger);
    log.debug({ status: result.success ? 'completed' : 'failed' }, 'one_time entity finished');
    return result;
  }

  if (entityRow.syncType === 'interval') {
    const result = await runCycle(entityRow, sourceAdapter, targetAdapter, context, logger);
    log.debug(
      { success: result.success, failedCount: result.failedCount, retryCount: result.retryCount },
      'interval entity run finished — sync_entities.status is not touched here, see sync_state for this run\'s result'
    );
    return result;
  }

  throw new Error(
    `Unsupported sync_type "${entityRow.syncType}" for the batch Orchestration Engine — ` +
    'real_time entities belong to a separate engine, not this one.'
  );
}

module.exports = { runEntityOnce };
