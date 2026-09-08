/**
 * Core schema — tenant intake + credentials (LLD discussion, 2026-09-01).
 *
 * Four tables:
 *   tenants        — identity only.
 *   sync_requests  — a tenant's source/target pairing (e.g. ConnectWise -> Keka).
 *   sync_entities  — one row per entity within a request, each with its own
 *                    sync_type and lifecycle status — lets Client run on
 *                    "interval" while Timesheet runs "one_time" under the
 *                    same request.
 *   credentials    — one row per (tenant, provider), not per source/target
 *                    role, so the same provider's credentials aren't
 *                    duplicated when it's a source in one request and a
 *                    target in another.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  pgm.createTable('tenants', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true, unique: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('sync_requests', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    source: { type: 'text', notNull: true },
    target: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // Only two providers exist today (connectwise, keka). Cheap to enforce now,
  // cheap to drop/widen the moment a third provider shows up.
  pgm.addConstraint('sync_requests', 'sync_requests_source_check', {
    check: "source in ('connectwise','keka')",
  });
  pgm.addConstraint('sync_requests', 'sync_requests_target_check', {
    check: "target in ('connectwise','keka')",
  });

  pgm.createTable('sync_entities', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    sync_request_id: { type: 'uuid', notNull: true, references: 'sync_requests', onDelete: 'cascade' },
    entity: { type: 'text', notNull: true },
    sync_type: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'submitted' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('sync_entities', 'sync_entities_request_entity_unique', {
    unique: ['sync_request_id', 'entity'],
  });
  pgm.addConstraint('sync_entities', 'sync_entities_entity_check', {
    check: "entity in ('client','project','timesheet')",
  });
  // real_time is a valid value today even though nothing can execute it yet
  // (no webhook/event layer) — see LLD discussion, 2026-09-01.
  pgm.addConstraint('sync_entities', 'sync_entities_sync_type_check', {
    check: "sync_type in ('real_time','interval','one_time')",
  });
  // 'active' is the resting state for real_time/interval; 'completed' only
  // applies to one_time. No separate run-health status here by design —
  // that's deferred to the orchestration-engine discussion.
  pgm.addConstraint('sync_entities', 'sync_entities_status_check', {
    check: "status in ('submitted','provisioning','active','completed','failed')",
  });

  pgm.createTable('credentials', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    provider: { type: 'text', notNull: true },
    // AES-256-GCM: ciphertext, nonce, and auth tag as separate columns
    // rather than folded into one JSON blob.
    encrypted_payload: { type: 'bytea', notNull: true },
    iv: { type: 'bytea', notNull: true },
    auth_tag: { type: 'bytea', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('credentials', 'credentials_tenant_provider_unique', {
    unique: ['tenant_id', 'provider'],
  });
  pgm.addConstraint('credentials', 'credentials_provider_check', {
    check: "provider in ('connectwise','keka')",
  });
};

exports.down = (pgm) => {
  pgm.dropTable('credentials');
  pgm.dropTable('sync_entities');
  pgm.dropTable('sync_requests');
  pgm.dropTable('tenants');
};
