/**
 * Container bootstrap.
 *
 * Redesigned 2026-09-08: one container invocation is now scoped to exactly
 * one `sync_entities` row, not a whole `sync_requests` row. Timing (when to
 * run — once, on an interval, on an event) moved out of this engine
 * entirely, to the Provisioning Engine / infra layer (not yet built); this
 * engine's only job per invocation is "run this one entity's cycle, once."
 * Since entities under the same sync_requests row can have independent
 * cadences, infra has to schedule per-entity — so the container's sole
 * input is SYNC_ENTITY_ID, not SYNC_REQUEST_ID. Everything needed (tenant,
 * source, target) is reachable from a sync_entities row via one JOIN back
 * to its parent sync_requests row. See docs/LLD-orchestration-engine.md.
 *
 * real_time entities are out of scope for this engine — see task tracking
 * a separate, not-yet-built engine for webhook/queue-driven sync.
 */
const { pool } = require('../db');

/**
 * @param {string} syncEntityId
 * @returns {Promise<{
 *   syncEntityId: string,
 *   syncRequestId: string,
 *   tenantId: string,
 *   source: string,
 *   target: string,
 *   entity: string,
 *   syncType: string,
 *   status: string,
 *   intervalSeconds: number|null
 * }>}
 */
async function loadSyncEntityRun(syncEntityId) {
  if (!syncEntityId) {
    throw new Error('loadSyncEntityRun requires a syncEntityId (expected from SYNC_ENTITY_ID env var)');
  }

  const { rows } = await pool.query(
    `SELECT
       se.id AS sync_entity_id, se.entity, se.sync_type, se.status, se.interval_seconds,
       sr.id AS sync_request_id, sr.tenant_id, sr.source, sr.target
     FROM sync_entities se
     JOIN sync_requests sr ON sr.id = se.sync_request_id
     WHERE se.id = $1`,
    [syncEntityId]
  );
  if (rows.length === 0) {
    throw new Error(`No sync_entities row found for id ${syncEntityId}`);
  }
  const row = rows[0];

  return {
    syncEntityId: row.sync_entity_id,
    syncRequestId: row.sync_request_id,
    tenantId: row.tenant_id,
    source: row.source,
    target: row.target,
    entity: row.entity,
    syncType: row.sync_type,
    status: row.status,
    intervalSeconds: row.interval_seconds,
  };
}

module.exports = { loadSyncEntityRun };
