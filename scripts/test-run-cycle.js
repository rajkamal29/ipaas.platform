/**
 * Throwaway verification script — runs one full Orchestration Engine
 * cycle against the mock server, and prints the resulting sync_state so
 * the failed/retry reconciliation logic can be inspected across repeated
 * runs.
 *
 * Updated 2026-09-08 for the entity-scoped redesign — takes a
 * sync_entity_id directly now, not a sync_request_id (no more searching
 * for the 'client' entity inside a list — the loaded run IS the entity).
 *
 * Usage: node scripts/test-run-cycle.js <sync_entity_id>
 */
require('dotenv').config();
const { loadSyncEntityRun } = require('../lib/orchestration/bootstrap');
const { createAdapter } = require('../lib/orchestration/adapter-registry');
const { runCycle } = require('../lib/orchestration/cycle');
const { loadOrCreateSyncState } = require('../lib/orchestration/sync-state');
const { pool } = require('../lib/db');

async function main() {
  const syncEntityId = process.argv[2];
  if (!syncEntityId) {
    console.error('Usage: node scripts/test-run-cycle.js <sync_entity_id>');
    process.exit(1);
  }

  const run = await loadSyncEntityRun(syncEntityId);
  const sourceAdapter = createAdapter(run.source, run.tenantId);
  const targetAdapter = createAdapter(run.target, run.tenantId);

  const context = { tenantId: run.tenantId, sourceProvider: run.source, targetProvider: run.target };
  const entityRow = { id: run.syncEntityId, entity: run.entity, syncType: run.syncType };

  console.log('Running cycle...\n');
  const result = await runCycle(entityRow, sourceAdapter, targetAdapter, context);
  console.log('\nCycle result:', result);

  const state = await loadOrCreateSyncState(entityRow.id);
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
