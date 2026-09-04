/**
 * Throwaway verification script — runs one full Orchestration Engine
 * cycle (Step 3) against the mock server, and prints the resulting
 * sync_state so the failed/retry reconciliation logic can be inspected
 * across repeated runs.
 *
 * Usage: node scripts/test-run-cycle.js <sync_request_id>
 */
require('dotenv').config();
const { loadSyncRequest } = require('../lib/orchestration/bootstrap');
const { createAdapter } = require('../lib/orchestration/adapter-registry');
const { runCycle } = require('../lib/orchestration/cycle');
const { loadOrCreateSyncState } = require('../lib/orchestration/sync-state');
const { pool } = require('../lib/db');

async function main() {
  const syncRequestId = process.argv[2];
  if (!syncRequestId) {
    console.error('Usage: node scripts/test-run-cycle.js <sync_request_id>');
    process.exit(1);
  }

  const request = await loadSyncRequest(syncRequestId);
  const sourceAdapter = createAdapter(request.source, request.tenantId);
  const targetAdapter = createAdapter(request.target, request.tenantId);

  const clientEntity = request.entities.find((e) => e.entity === 'client');
  if (!clientEntity) {
    console.error('No client entity found on this sync request');
    process.exit(1);
  }

  const context = { tenantId: request.tenantId, sourceProvider: request.source, targetProvider: request.target };

  console.log('Running cycle...\n');
  const result = await runCycle(clientEntity, sourceAdapter, targetAdapter, context);
  console.log('\nCycle result:', result);

  const state = await loadOrCreateSyncState(clientEntity.id);
  console.log('\nsync_state after cycle:');
  console.log(JSON.stringify(state, null, 2));

  // Close the pool's open sockets before exiting — process.exit() while pg
  // still holds connections open causes a libuv assertion crash on Windows.
  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('FAILED:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
