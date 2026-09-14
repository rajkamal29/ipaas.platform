import type { CanonicalEntity } from '../../domain/models/canonical-entity';
import type { Credential } from '../../domain/models/credential';
import type { GlobalMappingProfile } from '../../domain/models/global-mapping-profile';
import type { MappingProfile } from '../../domain/models/mapping-profile';
import type { SyncEntity } from '../../domain/models/sync-entity';
import type { SyncRequest } from '../../domain/models/sync-request';
import type { SyncState } from '../../domain/models/sync-state';
import type { Tenant } from '../../domain/models/tenant';

export interface MockTables {
  tenants: Tenant;
  syncRequests: SyncRequest;
  syncEntities: SyncEntity;
  credentials: Credential;
  syncStates: SyncState;
  canonicalEntities: CanonicalEntity;
  mappingProfiles: MappingProfile;
  globalMappingProfiles: GlobalMappingProfile;
}
export type MockTable = keyof MockTables;
export type MockDatabase = { [K in MockTable]: MockTables[K][] };
export type CrudTable = Exclude<MockTable, 'credentials' | 'syncStates'>;
