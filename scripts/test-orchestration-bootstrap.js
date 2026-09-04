/**
 * Throwaway verification script — NOT part of the orchestration engine
 * itself. Confirms lib/orchestration/bootstrap.js and adapter-registry.js
 * work against a real seeded sync_requests row before Step 3 (the actual
 * sync cycle) is built on top of them.
 *
 * Usage: node scripts/test-orchestration-bootstrap.js <sync_request_id>
 */
require('dotenv').config();
const { loadSyncRequest } = require('../lib/orchestration/bootstrap');
const { createAdapter } = require('../lib/orchestration/adapter-registry');
const { pool } = require('../lib/db');

async function main() {
  const syncRequestId = process.argv[2];
  if (!syncRequestId) {
    console.error('Usage: node scripts/test-orchestration-bootstrap.js <sync_request_id>');
    process.exit(1);
  }

  console.log('Loading sync request...');
  const request = await loadSyncRequest(syncRequestId);
  console.log(JSON.stringify(request, null, 2));

  console.log('\nInstantiating adapters (no network calls yet — just construction)...');
  const sourceAdapter = createAdapter(request.source, request.tenantId);
  const targetAdapter = createAdapter(request.target, request.tenantId);
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
