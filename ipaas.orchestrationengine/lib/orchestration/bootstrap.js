/**
 * Database bootstrap for orchestration runs.
 *
 * The main entrypoint first uses `loadAllTenants`, then calls
 * `loadSyncEntityRunsForTenant` for each tenant. Sync entity rows are joined
 * to their parent sync request so callers receive the complete execution
 * context—database entity ID, tenant ID, providers, entity type, cadence,
 * and status—in one normalized object.
 *
 * The shared query and mapper also back `loadSyncEntityRun`, which remains
 * available to the entity-specific diagnostic scripts. This keeps both the
 * full orchestration sweep and focused diagnostics on the same database
 * query and row-mapping implementation.
 *
 * real_time entities are out of scope for this engine and are rejected by
 * the existing per-entity run policy.
 */
const { pool } = require('../db');

function mapSyncEntityRun(row) {
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

/** Load all tenants that participate in the orchestration sweep. */
async function loadAllTenants() {
  const { rows } = await pool.query('SELECT id, name, created_at FROM tenants ORDER BY created_at, id');
  return rows;
}

/** Execute the shared sync-entity/context query with a fixed caller filter. */
async function querySyncEntityRuns(whereClause, values) {
  const { rows } = await pool.query(
    `SELECT
       se.id AS sync_entity_id, se.entity, se.sync_type, se.status, se.interval_seconds,
       sr.id AS sync_request_id, sr.tenant_id, sr.source, sr.target
     FROM sync_entities se
     JOIN sync_requests sr ON sr.id = se.sync_request_id
     WHERE ${whereClause}
     ORDER BY se.created_at, se.id`,
    values
  );
  return rows.map(mapSyncEntityRun);
}

/** Load every sync entity belonging to a tenant, or an empty array. */
async function loadSyncEntityRunsForTenant(tenantId) {
  return querySyncEntityRuns('sr.tenant_id = $1', [tenantId]);
}

/** Load one sync entity for focused diagnostic and test runs.
 *
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
    throw new Error('loadSyncEntityRun requires a syncEntityId');
  }

  const runs = await querySyncEntityRuns('se.id = $1', [syncEntityId]);
  if (runs.length === 0) {
    throw new Error(`No sync_entities row found for id ${syncEntityId}`);
  }
  return runs[0];
}

module.exports = { loadAllTenants, loadSyncEntityRunsForTenant, loadSyncEntityRun };
