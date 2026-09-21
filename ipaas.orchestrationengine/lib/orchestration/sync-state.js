/**
 * sync_state read/write (Orchestration Engine build plan, Step 3 support).
 *
 * One row per sync_entities row (1:1) — see docs/migrations/README.md.
 * loadOrCreateSyncState ensures a row exists (created empty on first run);
 * saveSyncState overwrites the whole row after a cycle completes.
 */
const { pool } = require('../db');

function normalizeRow(row) {
  return {
    id: row.id,
    syncEntityId: row.sync_entity_id,
    cursor: row.cursor, // jsonb -> pg already parses this to a JS object, or null
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
    lastError: row.last_error,
    failed: row.failed || [], // jsonb array -> already a JS array
    retry: row.retry || [],
    syncState: row.sync_state || [],
  };
}

async function loadOrCreateSyncState(syncEntityId) {
  const { rows } = await pool.query('SELECT * FROM sync_state WHERE sync_entity_id = $1', [syncEntityId]);
  if (rows.length > 0) {
    return normalizeRow(rows[0]);
  }
  const { rows: created } = await pool.query(
    'INSERT INTO sync_state (sync_entity_id) VALUES ($1) RETURNING *',
    [syncEntityId]
  );
  return normalizeRow(created[0]);
}

async function saveSyncState(syncEntityId, { cursor, lastRunAt, lastRunStatus, lastError, failed, retry, syncState }) {
  await pool.query(
    `UPDATE sync_state
     SET cursor = $2, last_run_at = $3, last_run_status = $4, last_error = $5,
         failed = $6, retry = $7, sync_state = $8, updated_at = now()
     WHERE sync_entity_id = $1`,
    [
      syncEntityId,
      cursor ? JSON.stringify(cursor) : null, // pg does not auto-serialize objects for jsonb params
      lastRunAt,
      lastRunStatus,
      lastError,
      JSON.stringify(failed || []),
      JSON.stringify(retry || []),
      JSON.stringify(syncState || []),
    ]
  );
}

module.exports = { loadOrCreateSyncState, saveSyncState };
