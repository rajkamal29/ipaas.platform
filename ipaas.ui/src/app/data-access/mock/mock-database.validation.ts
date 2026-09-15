import {
  validateCanonicalEntity,
  validateCredential,
  validateGlobalMappingProfile,
  validateMappingProfile,
  validateSyncEntity,
  validateSyncRequest,
  validateSyncState,
  validateTenant,
} from '../../domain/validation/model-validation';
import { RepositoryError } from '../contracts/repository-error';
import type { MockDatabase } from './mock-database';

function unique<T>(rows: readonly T[], key: (row: T) => string, constraint: string): void {
  const keys = new Set<string>();
  for (const row of rows) {
    const value = key(row);
    if (keys.has(value))
      throw new RepositoryError(
        'conflict',
        'A record already uses this unique key.',
        [],
        constraint,
      );
    keys.add(value);
  }
}

function foreignKey<T>(
  rows: readonly T[],
  parentIds: ReadonlySet<string>,
  key: (row: T) => string,
  field: string,
  constraint: string,
): void {
  if (rows.some((row) => !parentIds.has(key(row)))) {
    throw new RepositoryError(
      'validation',
      'The referenced parent does not exist.',
      [{ field, code: 'foreign-key', message: 'The referenced parent does not exist.' }],
      constraint,
    );
  }
}

const tableNames = {
  tenants: 'tenants',
  syncRequests: 'sync_requests',
  syncEntities: 'sync_entities',
  credentials: 'credentials',
  syncStates: 'sync_state',
  canonicalEntities: 'canonical_entities',
  mappingProfiles: 'mapping_profiles',
  globalMappingProfiles: 'global_mapping_profiles',
} as const;
const validators = {
  tenants: validateTenant,
  syncRequests: validateSyncRequest,
  syncEntities: validateSyncEntity,
  credentials: validateCredential,
  syncStates: validateSyncState,
  canonicalEntities: validateCanonicalEntity,
  mappingProfiles: validateMappingProfile,
  globalMappingProfiles: validateGlobalMappingProfile,
} as const;

export function validateMockDatabase(database: MockDatabase): void {
  for (const table of Object.keys(validators) as (keyof typeof validators)[]) {
    for (const row of database[table]) {
      const issues = validators[table](row);
      if (issues.length)
        throw new RepositoryError('validation', `Invalid ${table} record.`, issues);
    }
    unique<{ readonly id: string }>(database[table], (row) => row.id, `${tableNames[table]}_pkey`);
  }

  unique(database.tenants, (row) => row.name, 'tenants_name_key');
  unique(
    database.syncEntities,
    (row) => JSON.stringify([row.syncRequestId, row.entity]),
    'sync_entities_request_entity_unique',
  );
  unique(
    database.credentials,
    (row) => JSON.stringify([row.tenantId, row.provider]),
    'credentials_tenant_provider_unique',
  );
  unique(database.syncStates, (row) => row.syncEntityId, 'sync_state_sync_entity_id_key');
  unique(
    database.canonicalEntities,
    (row) => JSON.stringify([row.name, row.version]),
    'canonical_entities_name_version_unique',
  );
  unique(
    database.mappingProfiles.filter((row) => row.isActive),
    (row) => JSON.stringify([row.tenantId, row.provider, row.entity, row.direction]),
    'mapping_profiles_one_active_idx',
  );
  unique(
    database.globalMappingProfiles.filter((row) => row.isActive),
    (row) => JSON.stringify([row.provider, row.entity, row.direction]),
    'global_mapping_profiles_one_active_idx',
  );

  const tenants = new Set(database.tenants.map((row) => row.id));
  const requests = new Set(database.syncRequests.map((row) => row.id));
  const entities = new Set(database.syncEntities.map((row) => row.id));
  foreignKey(
    database.syncRequests,
    tenants,
    (row) => row.tenantId,
    'tenantId',
    'sync_requests_tenant_id_fkey',
  );
  foreignKey(
    database.credentials,
    tenants,
    (row) => row.tenantId,
    'tenantId',
    'credentials_tenant_id_fkey',
  );
  foreignKey(
    database.mappingProfiles,
    tenants,
    (row) => row.tenantId,
    'tenantId',
    'mapping_profiles_tenant_id_fkey',
  );
  foreignKey(
    database.syncEntities,
    requests,
    (row) => row.syncRequestId,
    'syncRequestId',
    'sync_entities_sync_request_id_fkey',
  );
  foreignKey(
    database.syncStates,
    entities,
    (row) => row.syncEntityId,
    'syncEntityId',
    'sync_state_sync_entity_id_fkey',
  );
}
