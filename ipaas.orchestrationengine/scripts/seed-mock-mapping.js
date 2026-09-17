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
  required: ['id', 'name'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    identifier: { type: 'string' },
    status: {
      type: 'string',
      enum: ['active', 'inactive', 'unknown'],
    },
    description: { type: 'string' },
    emailAddress: { type: 'string' },
    phoneNumber: { type: 'string' },
    website: { type: 'string' },
    addressLine1: { type: 'string' },
    addressLine2: { type: 'string' },
    city: { type: 'string' },
    stateOrProvince: { type: 'string' },
    postalCode: { type: 'string' },
    countryCode: { type: 'string' },
  },
};

const INBOUND_CONNECTWISE_CLIENT = [
  { canonicalField: 'id', sourceField: 'id', transform: { type: 'toString' } },
  { canonicalField: 'name', sourceField: 'name' },
  { canonicalField: 'description', sourceField: 'identifier' },
  {
    canonicalField: 'status',
    sourceField: 'status.name',
    transform: { type: 'enumMap', map: { Active: 'active', Inactive: 'inactive' }, default: 'unknown' },
  },
  { canonicalField: 'phoneNumber', sourceField: 'phoneNumber' },
  { canonicalField: 'website', sourceField: 'website' },
  { canonicalField: 'emailAddress', sourceField: 'emailAddress' },
  { canonicalField: 'addressLine1', sourceField: 'addressLine1' },
  { canonicalField: 'addressLine2', sourceField: 'addressLine2' },
  { canonicalField: 'city', sourceField: 'city' },
  { canonicalField: 'stateOrProvince', sourceField: 'state' },
  { canonicalField: 'postalCode', sourceField: 'zip' },
  { canonicalField: 'countryCode', sourceField: 'country.name' },
];

const OUTBOUND_KEKA_CLIENT = [
  // "id" is forwarded through so the mock write endpoint (rigged by id)
  // still behaves as documented — in a real target this would likely be
  // a reference/external-id field instead, once verified.
  { canonicalField: 'id', targetField: 'code' },
  { canonicalField: 'name', targetField: 'name' },
  { canonicalField: 'description', targetField: 'description' },
  { canonicalField: 'phoneNumber', targetField: 'phone' },
  { canonicalField: 'website', targetField: 'website' },
  { canonicalField: 'emailAddress', targetField: 'email' },
  { canonicalField: 'addressLine1', targetField: 'billingInfo.billingAddress.addressLine1' },
  { canonicalField: 'addressLine2', targetField: 'billingInfo.billingAddress.addressLine2' },
  { canonicalField: 'city', targetField: 'billingInfo.billingAddress.city' },
  { canonicalField: 'stateOrProvince', targetField: 'billingInfo.billingAddress.state' },
  { canonicalField: 'postalCode', targetField: 'billingInfo.billingAddress.zip' },
  { canonicalField: 'countryCode', targetField: 'billingInfo.billingAddress.countryCode' },
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
