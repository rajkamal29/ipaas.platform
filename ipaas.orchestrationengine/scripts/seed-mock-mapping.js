/**
 * Throwaway seed script — inserts the canonical Client schema plus the
 * ConnectWise (inbound) and Keka (outbound) mapping profiles for a
 * tenant. No UI/API yet, so this is manual — same pattern as
 * seed-mock-credentials.js. Safe to re-run (upserts).
 *
 * Usage: node scripts/seed-mock-mapping.js <tenant_id>
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
  // "id" is forwarded through so the mock write endpoint (rigged by id)
  // still behaves as documented — in a real target this would likely be
  // a reference/external-id field instead, once verified.
  { canonicalField: 'id', targetField: 'id' },
  { canonicalField: 'name', targetField: 'name' },
  { canonicalField: 'name', targetField: 'billingName' },
];

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error('Usage: node scripts/seed-mock-mapping.js <tenant_id>');
    process.exit(1);
  }

  await pool.query(
    `INSERT INTO canonical_entities (name, version, schema) VALUES ('client', 1, $1)
     ON CONFLICT (name, version) DO UPDATE SET schema = $1`,
    [JSON.stringify(CLIENT_SCHEMA)]
  );
  console.log('canonical_entities: client v1 upserted.');

  await pool.query(
    `INSERT INTO mapping_profiles (tenant_id, provider, entity, direction, version, field_mappings, is_active)
     VALUES ($1, 'connectwise', 'client', 'inbound', 1, $2, true)
     ON CONFLICT (tenant_id, provider, entity, direction) WHERE is_active
     DO UPDATE SET field_mappings = $2`,
    [tenantId, JSON.stringify(INBOUND_CONNECTWISE_CLIENT)]
  );
  console.log('mapping_profiles: connectwise client inbound upserted.');

  await pool.query(
    `INSERT INTO mapping_profiles (tenant_id, provider, entity, direction, version, field_mappings, is_active)
     VALUES ($1, 'keka', 'client', 'outbound', 1, $2, true)
     ON CONFLICT (tenant_id, provider, entity, direction) WHERE is_active
     DO UPDATE SET field_mappings = $2`,
    [tenantId, JSON.stringify(OUTBOUND_KEKA_CLIENT)]
  );
  console.log('mapping_profiles: keka client outbound upserted.');

  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('FAILED:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
