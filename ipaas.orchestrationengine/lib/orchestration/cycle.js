/**
 * Per-entity sync cycle (Orchestration Engine build plan, Step 3).
 *
 * Given one sync_entities row plus its source/target adapters, runs one
 * full cycle: fetch delta + reconciliation records, map (placeholder),
 * write, and update sync_state accordingly.
 */
const { loadOrCreateSyncState, saveSyncState } = require('./sync-state');
const { loadActiveMappingProfile, loadCanonicalSchema } = require('../mapping/profiles');
const { applyMapping, validateCanonical } = require('../mapping/engine');
const { logger: defaultLogger } = require('../logger');

const FAILED_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CURSOR_SAFETY_BUFFER_MS = 60 * 1000; // 60s, absorbs source-side write lag

/**
 * Assumption, not yet verified for Project/Timesheet shapes: both
 * ConnectWise and Keka records carry a plain `id` field.
 */
function extractExternalId(raw) {
  return String(raw.id);
}

function extractTargetId(result) {
  const candidate = result?.id ?? result?.data?.id ??
    (typeof result?.data === 'string' || typeof result?.data === 'number' ? result.data : null);
  return candidate === undefined || candidate === null ? null : String(candidate);
}

function mergeSuccessfulSyncState(existing, successful) {
  const byExternalId = new Map((existing || []).map((entry) => {
    const externalId = String(entry.external_id ?? entry.source_id);
    return [externalId, { external_id: externalId, target_id: String(entry.target_id) }];
  }));
  for (const entry of successful) {
    byExternalId.set(entry.external_id, entry);
  }
  return Array.from(byExternalId.values());
}

async function fetchAllPages(adapter, entity, modifiedSince) {
  const records = [];
  let pageNumber = 1;
  let hasMore = true;
  while (hasMore) {
    const page = await adapter.fetch(entity, { pageNumber, pageSize: 100, modifiedSince });
    records.push(...page.records);
    hasMore = page.hasMore;
    pageNumber += 1;
  }
  return records;
}

/**
 * Reconciliation records first, delta records second — Map.set overwrites
 * on a repeated key, so delta (fresher) wins if an ID appears in both.
 */
function mergeRecords(deltaRecords, reconcileRecords) {
  const byId = new Map();
  for (const r of reconcileRecords) byId.set(extractExternalId(r), r);
  for (const r of deltaRecords) byId.set(extractExternalId(r), r);
  return Array.from(byId.values());
}

/**
 * @param {{ id: string, entity: string, syncType: string }} entityRow
 * @param sourceAdapter
 * @param targetAdapter
 * @param {{ tenantId: string, sourceProvider: string, targetProvider: string }} context
 * @param logger
 */
async function runCycle(entityRow, sourceAdapter, targetAdapter, context, logger = defaultLogger) {
  const log = logger;
  const state = await loadOrCreateSyncState(entityRow.id);
  const cycleStartedAt = new Date();
  const modifiedSince = state.cursor?.modifiedSince ?? null;

  // Loaded once per cycle, not per record — this tenant's active mapping
  // profiles and the canonical schema they both map through.
  const inboundProfile = await loadActiveMappingProfile(context.tenantId, context.sourceProvider, entityRow.entity, 'inbound');
  const outboundProfile = await loadActiveMappingProfile(context.tenantId, context.targetProvider, entityRow.entity, 'outbound');
  const canonicalSchemaRow = await loadCanonicalSchema(entityRow.entity);

  log.debug(
    { modifiedSince, inboundMappingSource: inboundProfile.source, outboundMappingSource: outboundProfile.source },
    'cycle started'
  );

  // 1 & 2. Delta + reconciliation fetch.
  const deltaRecords = await fetchAllPages(sourceAdapter, entityRow.entity, modifiedSince);

  const reconcileIds = [...state.failed.map((f) => f.external_id), ...state.retry.map((r) => r.external_id)];
  const reconcileRecords = reconcileIds.length > 0
    ? await sourceAdapter.fetchByIds(entityRow.entity, reconcileIds)
    : [];

  const merged = mergeRecords(deltaRecords, reconcileRecords);
  log.debug(
    { deltaCount: deltaRecords.length, reconcileCount: reconcileRecords.length, mergedCount: merged.length },
    'fetched'
  );

  // 3. Process each record: map inbound -> validate -> map outbound -> write -> classify outcome.
  const newFailedThisCycle = [];
  const newRetryThisCycle = [];
  const syncedThisCycle = [];
  let updatedThisCycle = 0;
  let authError = null;

  for (const raw of merged) {
    const externalId = extractExternalId(raw);
    try {
      const canonical = applyMapping(inboundProfile, raw);
      const { valid, errors } = validateCanonical(canonicalSchemaRow, canonical);
      if (!valid) {
        // Not one of the adapter's HTTP-derived error types (auth/
        // rate_limit/not_found/unknown) — a data-shape problem caught
        // before any write attempt. Falls through to the newFailedThisCycle
        // branch below like any other non-technical error.
        const err = new Error(`canonical validation failed: ${errors}`);
        err.type = 'validation';
        throw err;
      }
      const mapped = applyMapping(outboundProfile, canonical);
      const existingSync = state.syncState.find(
        (entry) => String(entry.external_id ?? entry.source_id) === externalId
      );

      if (existingSync) {
        await targetAdapter.update(entityRow.entity, existingSync.target_id, mapped);
        updatedThisCycle += 1;
      } else {
        const writeResult = await targetAdapter.write(entityRow.entity, mapped);
        const targetId = extractTargetId(writeResult);
        if (targetId !== null) {
          syncedThisCycle.push({ external_id: externalId, target_id: targetId });
        } else {
          log.warn({ externalId }, 'write succeeded without a target id — successful identity mapping not stored');
        }
      }
    } catch (err) {
      if (err.type === 'auth') {
        // Broken credentials — a whole-run problem, not a per-record one.
        // Stop immediately; don't touch the failed/retry lists for
        // whatever's left unprocessed.
        authError = err;
        log.error({ externalId, err: err.message }, 'auth error — stopping cycle');
        break;
      }
      if (err.type === 'not_found') {
        // Record no longer exists upstream — nothing to retry or track,
        // just drop it.
        log.warn({ externalId }, 'record not found upstream — dropping');
        continue;
      }
      const entry = { external_id: externalId, error_message: err.message };
      if (err.type === 'rate_limit' || err.type === 'unknown' || !err.type) {
        newRetryThisCycle.push({ ...entry, error_type: err.type || 'unknown' });
        log.warn({ externalId, errType: err.type }, 'technical failure — queued for retry');
      } else {
        newFailedThisCycle.push(entry);
        log.warn({ externalId, errType: err.type }, 'data failure — added to failed list');
      }
    }
  }

  // 4. Reconcile the `failed` list. Every existing entry was necessarily
  // re-attempted this cycle (its ID is always in reconcileIds), so its
  // outcome is now fully represented in newFailedThisCycle: if it's not
  // there, it either got fixed or vanished upstream — either way, drop it.
  // If it IS there, carry its original first_failed_at forward and refresh
  // last_checked_at; drop anything past the 30-day TTL regardless.
  const updatedFailed = newFailedThisCycle
    .map((entry) => {
      const existing = state.failed.find((f) => f.external_id === entry.external_id);
      return {
        ...entry,
        first_failed_at: existing?.first_failed_at ?? cycleStartedAt.toISOString(),
        last_checked_at: cycleStartedAt.toISOString(),
      };
    })
    .filter((entry) => cycleStartedAt.getTime() - new Date(entry.first_failed_at).getTime() <= FAILED_TTL_MS);

  // `retry` is fully replaced, not merged — see docs/migrations/README.md.
  const updatedRetry = newRetryThisCycle;
  const updatedSyncState = authError
    ? state.syncState
    : mergeSuccessfulSyncState(state.syncState, syncedThisCycle);

  // 5. Cursor only advances on a clean run. On an auth error we can't be
  // sure everything after the break point was even attempted, so the
  // previous cursor is kept rather than risking skipped records next time.
  const nextCursor = authError
    ? state.cursor
    : { modifiedSince: new Date(cycleStartedAt.getTime() - CURSOR_SAFETY_BUFFER_MS).toISOString() };

  await saveSyncState(entityRow.id, {
    cursor: nextCursor,
    lastRunAt: cycleStartedAt,
    lastRunStatus: authError ? 'failed' : 'success',
    lastError: authError ? authError.message : null,
    failed: updatedFailed,
    retry: updatedRetry,
    syncState: updatedSyncState,
  });

  log.info(
    {
      status: authError ? 'failed' : 'success',
      processedCount: merged.length,
      successCount: syncedThisCycle.length + updatedThisCycle,
      failedCount: updatedFailed.length,
      retryCount: updatedRetry.length,
      cursor: nextCursor,
    },
    'entity sync completed'
  );

    return { success: !authError, processed: merged.length, failedCount: updatedFailed.length, retryCount: updatedRetry.length };
}

module.exports = {
  runCycle,
  extractExternalId,
  extractTargetId,
  mergeSuccessfulSyncState,
};
