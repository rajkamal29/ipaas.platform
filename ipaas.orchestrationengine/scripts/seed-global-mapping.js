/**
 * Seeds the platform-level default mapping profiles (global_mapping_profiles)
 * for ConnectWise (inbound) and Keka (outbound) Client, plus the canonical
 * Client schema they both map through. No tenant_id — these are the
 * defaults any tenant automatically inherits as long as it has no
 * active row of its own in mapping_profiles for the same
 * provider+entity+direction (LLD discussion, 2026-09-03).
 *
 * Safe to re-run (upserts). Same field mappings as seed-mock-mapping.js's
 * per-tenant rows today — this is the intended starting point: a tenant
 * that never customizes gets exactly this behavior.
 *
 * Usage: node scripts/seed-global-mapping.js
 */
require('dotenv').config();
const { pool } = require('../lib/db');

const CLIENT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    status: { type: 'string' },
  },
  required: ['id', 'name'],
};

const INBOUND_CONNECTWISE_CLIENT = [
  { canonicalField: 'id', sourceField: 'id', transform: { type: 'toString' } },
  { canonicalField: 'name', sourceField: 'name' },
  {
    canonicalField: 'status',
    sourceField: 'status.name',
    transform: { type: 'enumMap', map: { Active: 'active', Inactive: 'inactive' }, default: 'unknown' },
  },
];

const OUTBOUND_KEKA_CLIENT = [
  { canonicalField: 'id', targetField: 'id' },
  { canonicalField: 'name', targetField: 'name' },
  { canonicalField: 'name', targetField: 'billingName' },
];

async function main() {
  await pool.query(
    `INSERT INTO canonical_entities (name, version, schema) VALUES ('client', 1, $1)
     ON CONFLICT (name, version) DO UPDATE SET schema = $1`,
    [JSON.stringify(CLIENT_SCHEMA)]
  );
  console.log('canonical_entities: client v1 upserted.');

  await pool.query(
    `INSERT INTO global_mapping_profiles (provider, entity, direction, version, field_mappings, is_active)
     VALUES ('connectwise', 'client', 'inbound', 1, $1, true)
     ON CONFLICT (provider, entity, direction) WHERE is_active
     DO UPDATE SET field_mappings = $1`,
    [JSON.stringify(INBOUND_CONNECTWISE_CLIENT)]
  );
  console.log('global_mapping_profiles: connectwise client inbound upserted.');

  await pool.query(
    `INSERT INTO global_mapping_profiles (provider, entity, direction, version, field_mappings, is_active)
     VALUES ('keka', 'client', 'outbound', 1, $1, true)
     ON CONFLICT (provider, entity, direction) WHERE is_active
     DO UPDATE SET field_mappings = $1`,
    [JSON.stringify(OUTBOUND_KEKA_CLIENT)]
  );
  console.log('global_mapping_profiles: keka client outbound upserted.');

  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('FAILED:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
