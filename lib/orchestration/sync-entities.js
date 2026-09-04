/**
 * Small helper for writing back to sync_entities.status — nothing needed
 * to write to this table until scheduling (Step 4) existed; everything
 * before this only read it.
 */
const { pool } = require('../db');

async function updateEntityStatus(entityId, status) {
  await pool.query('UPDATE sync_entities SET status = $2, updated_at = now() WHERE id = $1', [entityId, status]);
}

module.exports = { updateEntityStatus };
