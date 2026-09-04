/**
 * Mapping/canonical layer (LLD discussion, 2026-09-01) — lighter than the
 * pre-reset design: canonical schema + mapping profiles still exist, but
 * canonical records are NOT persisted (no canonical_records table). The
 * current engine runs fetch -> map -> write as one in-memory pipeline per
 * cycle, so the original reason for persisting canonical rows (decoupled
 * inbound/outbound stages) doesn't apply to this architecture.
 *
 * mapping_profiles is per-TENANT (not global) — each tenant can override
 * its own field mappings per provider+entity+direction.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('canonical_entities', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    version: { type: 'integer', notNull: true },
    schema: { type: 'jsonb', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('canonical_entities', 'canonical_entities_name_version_unique', {
    unique: ['name', 'version'],
  });
  pgm.addConstraint('canonical_entities', 'canonical_entities_name_check', {
    check: "name in ('client','project','timesheet')",
  });

  pgm.createTable('mapping_profiles', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    provider: { type: 'text', notNull: true },
    entity: { type: 'text', notNull: true },
    direction: { type: 'text', notNull: true },
    version: { type: 'integer', notNull: true },
    field_mappings: { type: 'jsonb', notNull: true },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('mapping_profiles', 'mapping_profiles_provider_check', {
    check: "provider in ('connectwise','keka')",
  });
  pgm.addConstraint('mapping_profiles', 'mapping_profiles_entity_check', {
    check: "entity in ('client','project','timesheet')",
  });
  pgm.addConstraint('mapping_profiles', 'mapping_profiles_direction_check', {
    check: "direction in ('inbound','outbound')",
  });
  // Only one ACTIVE profile per tenant+provider+entity+direction at a
  // time — multiple versions can exist historically, but exactly one is
  // live. Also the target of seed scripts' ON CONFLICT upserts.
  pgm.createIndex('mapping_profiles', ['tenant_id', 'provider', 'entity', 'direction'], {
    unique: true,
    where: 'is_active',
    name: 'mapping_profiles_one_active_idx',
  });
};

exports.down = (pgm) => {
  pgm.dropTable('mapping_profiles');
  pgm.dropTable('canonical_entities');
};
