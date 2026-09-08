/**
 * Loads mapping_profiles / global_mapping_profiles / canonical_entities
 * rows from Postgres.
 */
const { pool } = require('../db');

/**
 * Resolves the mapping profile a tenant actually uses for a given
 * provider+entity+direction: a tenant-specific override if one is active,
 * otherwise the platform-level global default (LLD discussion, 2026-09-03).
 * Throws only if NEITHER exists — there is deliberately no third,
 * no-op fallback.
 *
 * The returned row carries `source: 'tenant' | 'global'` so callers (e.g.
 * cycle.js's logging) can tell which one actually applied without a
 * second query — useful once tenants can move between inherited and
 * customized, since the two look identical otherwise.
 */
async function loadActiveMappingProfile(tenantId, provider, entity, direction) {
  const { rows: tenantRows } = await pool.query(
    `SELECT * FROM mapping_profiles
     WHERE tenant_id = $1 AND provider = $2 AND entity = $3 AND direction = $4 AND is_active = true
     LIMIT 1`,
    [tenantId, provider, entity, direction]
  );
  if (tenantRows.length > 0) {
    return { ...tenantRows[0], source: 'tenant' };
  }

  const { rows: globalRows } = await pool.query(
    `SELECT * FROM global_mapping_profiles
     WHERE provider = $1 AND entity = $2 AND direction = $3 AND is_active = true
     LIMIT 1`,
    [provider, entity, direction]
  );
  if (globalRows.length > 0) {
    return { ...globalRows[0], source: 'global' };
  }

  throw new Error(
    `No mapping profile (tenant or global) for tenant=${tenantId} provider=${provider} entity=${entity} direction=${direction}`
  );
}

async function loadCanonicalSchema(entity) {
  const { rows } = await pool.query(
    'SELECT * FROM canonical_entities WHERE name = $1 ORDER BY version DESC LIMIT 1',
    [entity]
  );
  if (rows.length === 0) {
    throw new Error(`No canonical_entities row for entity=${entity}`);
  }
  return rows[0];
}

module.exports = { loadActiveMappingProfile, loadCanonicalSchema };
