/**
 * Container bootstrap (Orchestration Engine build plan, Step 1).
 *
 * One container is scoped to exactly one `sync_requests` row (2026-09-01
 * design discussion). This module loads that row plus all of its child
 * `sync_entities` rows, and returns everything the rest of the engine needs
 * to get started — tenantId, source, target, and the list of entities to
 * sync, each with its own sync_type/status.
 */
const { pool } = require('../db');

/**
 * @param {string} syncRequestId
 * @returns {Promise<{
 *   syncRequestId: string,
 *   tenantId: string,
 *   source: string,
 *   target: string,
 *   entities: Array<{ id: string, entity: string, syncType: string, status: string, intervalSeconds: number|null }>
 * }>}
 */
async function loadSyncRequest(syncRequestId) {
  if (!syncRequestId) {
    throw new Error('loadSyncRequest requires a syncRequestId (expected from SYNC_REQUEST_ID env var)');
  }

  const { rows: requestRows } = await pool.query(
    'SELECT id, tenant_id, source, target FROM sync_requests WHERE id = $1',
    [syncRequestId]
  );
  if (requestRows.length === 0) {
    throw new Error(`No sync_requests row found for id ${syncRequestId}`);
  }
  const request = requestRows[0];

  const { rows: entityRows } = await pool.query(
    'SELECT id, entity, sync_type, status, interval_seconds FROM sync_entities WHERE sync_request_id = $1',
    [syncRequestId]
  );
  if (entityRows.length === 0) {
    throw new Error(`sync_requests ${syncRequestId} has no sync_entities rows — nothing to run`);
  }

  return {
    syncRequestId: request.id,
    tenantId: request.tenant_id,
    source: request.source,
    target: request.target,
    entities: entityRows.map((row) => ({
      id: row.id,
      entity: row.entity,
      syncType: row.sync_type,
      status: row.status,
      intervalSeconds: row.interval_seconds,
    })),
  };
}

module.exports = { loadSyncRequest };
