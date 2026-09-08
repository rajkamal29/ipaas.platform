/**
 * Add per-entity cadence for `interval` sync_type (LLD discussion,
 * 2026-09-01). Required and floored at 60s for `interval` rows; must stay
 * NULL for `one_time`/`real_time`, where it's meaningless.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('sync_entities', {
    interval_seconds: { type: 'integer' },
  });

  pgm.addConstraint('sync_entities', 'sync_entities_interval_seconds_check', {
    check: `
      (sync_type = 'interval' AND interval_seconds IS NOT NULL AND interval_seconds >= 60)
      OR
      (sync_type != 'interval' AND interval_seconds IS NULL)
    `,
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('sync_entities', 'sync_entities_interval_seconds_check');
  pgm.dropColumn('sync_entities', 'interval_seconds');
};
