/**
 * Stores successful source-to-target identity mappings on the existing
 * per-sync-entity state row. Each JSONB array entry is tenant/entity scoped
 * and can be updated by request_id when a source lastUpdated value is present.
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('sync_state', {
    sync_state: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('sync_state', 'sync_state');
};
