/**
 * Throwaway verification script — NOT part of the orchestration engine
 * itself. Confirms lib/orchestration/bootstrap.js and adapter-registry.js
 * work against a real seeded sync_entities row before Step 3 (the actual
 * sync cycle) is built on top of them.
 *
 * Updated 2026-09-08 for the entity-scoped redesign — takes a
 * sync_entity_id now, not a sync_request_id.
 *
 * Usage: node scripts/test-orchestration-bootstrap.js <sync_entity_id>
 */
require('dotenv').config();
const { loadSyncEntityRun } = require('../lib/orchestration/bootstrap');
const { createAdapter } = require('../lib/orchestration/adapter-registry');
const { pool } = require('../lib/db');

async function main() {
  const syncEntityId = process.argv[2];
  if (!syncEntityId) {
    console.error('Usage: node scripts/test-orchestration-bootstrap.js <sync_entity_id>');
    process.exit(1);
  }

  console.log('Loading sync entity run...');
  const run = await loadSyncEntityRun(syncEntityId);
  console.log(JSON.stringify(run, null, 2));

  console.log('\nInstantiating adapters (no network calls yet — just construction)...');
  const sourceAdapter = createAdapter(run.source, run.tenantId);
  const targetAdapter = createAdapter(run.target, run.tenantId);
  console.log('source adapter:', sourceAdapter.constructor.name);
  console.log('target adapter:', targetAdapter.constructor.name);

  console.log('\nOK — bootstrap + adapter registry both work.');
  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('FAILED:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
