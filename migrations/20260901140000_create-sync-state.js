/**
 * sync_state — per-entity run tracking (LLD discussion, 2026-09-01).
 *
 * One row per sync_entities row (1:1). Tracks the incremental cursor, the
 * last run's outcome, and two distinct failure classes:
 *   - failed: data-shape failures (mapping/validation) — reconciled every
 *     run (re-attempted against the stored payload; dropped once fixed or
 *     once older than 30 days — pruning happens in application code, not
 *     the database).
 *   - retry: technical failures (rate limit, network, transient errors) —
 *     replaced wholesale every run with whatever's still failing after
 *     that run's retry attempt.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('sync_state', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    sync_entity_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      references: 'sync_entities',
      onDelete: 'cascade',
    },
    // { "modifiedSince": "2026-09-01T10:00:00Z" } — object, not a bare
    // string, so more watermark/resume state can be added later without a
    // schema change.
    cursor: { type: 'jsonb' },
    last_run_at: { type: 'timestamptz' },
    last_run_status: { type: 'text' },
    last_error: { type: 'text' },
    failed: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
    retry: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('sync_state', 'sync_state_last_run_status_check', {
    check: "last_run_status in ('success','failed')",
  });
};

exports.down = (pgm) => {
  pgm.dropTable('sync_state');
};
