/**
 * Global mapping profile defaults (LLD discussion, 2026-09-03).
 *
 * mapping_profiles is per-tenant, which means onboarding a new tenant on an
 * already-supported provider requires manually seeding that tenant's own
 * field mappings before anything can sync — there is no default. This
 * table gives every provider+entity+direction a platform-level default
 * mapping that a tenant inherits automatically as long as it has NO active
 * row of its own in mapping_profiles for that same provider+entity+direction.
 *
 * Deliberately NOT a copy-on-inherit design: a tenant that inherits gets
 * whatever this table's active row currently says, every cycle (profiles
 * are loaded fresh per cycle, never cached across cycles) — so improving
 * the global default improves every inheriting tenant automatically. Only
 * a genuine customization creates a row in mapping_profiles; "inherited"
 * vs "customized" is therefore just "does a tenant row exist or not," with
 * no separate flag to keep in sync.
 *
 * Keyed by provider+entity+direction, NOT by a source/target pair — same
 * reasoning as mapping_profiles itself: an inbound mapping only depends on
 * the source provider, an outbound mapping only depends on the target
 * provider, because both go through the shared canonical_entities shape in
 * between. Keying by pairs would grow N x N with providers; this stays
 * N + N. See docs/LLD-orchestration-engine.md §5.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('global_mapping_profiles', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    provider: { type: 'text', notNull: true },
    entity: { type: 'text', notNull: true },
    direction: { type: 'text', notNull: true },
    version: { type: 'integer', notNull: true },
    field_mappings: { type: 'jsonb', notNull: true },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // Same value sets as mapping_profiles — kept in sync deliberately; if a
  // provider/entity is added to one, it must be added to the other.
  pgm.addConstraint('global_mapping_profiles', 'global_mapping_profiles_provider_check', {
    check: "provider in ('connectwise','keka')",
  });
  pgm.addConstraint('global_mapping_profiles', 'global_mapping_profiles_entity_check', {
    check: "entity in ('client','project','timesheet')",
  });
  pgm.addConstraint('global_mapping_profiles', 'global_mapping_profiles_direction_check', {
    check: "direction in ('inbound','outbound')",
  });
  // Only one ACTIVE default per provider+entity+direction at a time —
  // mirrors mapping_profiles_one_active_idx, just without a tenant_id.
  pgm.createIndex('global_mapping_profiles', ['provider', 'entity', 'direction'], {
    unique: true,
    where: 'is_active',
    name: 'global_mapping_profiles_one_active_idx',
  });
};

exports.down = (pgm) => {
  pgm.dropTable('global_mapping_profiles');
};
