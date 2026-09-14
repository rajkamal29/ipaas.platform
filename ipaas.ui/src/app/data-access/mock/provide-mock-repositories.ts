import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import {
  TENANT_REPOSITORY,
  SYNC_REQUEST_REPOSITORY,
  SYNC_ENTITY_REPOSITORY,
  CREDENTIAL_REPOSITORY,
  SYNC_STATE_REPOSITORY,
  CANONICAL_ENTITY_REPOSITORY,
  MAPPING_PROFILE_REPOSITORY,
  GLOBAL_MAPPING_PROFILE_REPOSITORY,
} from '../tokens/repository.tokens';
import { MockDataService } from './mock-data.service';
import { MockTenantRepository } from './repositories/mock-tenant.repository';
import { MockSyncRequestRepository } from './repositories/mock-sync-request.repository';
import { MockSyncEntityRepository } from './repositories/mock-sync-entity.repository';
import { MockCredentialRepository } from './repositories/mock-credential.repository';
import { MockSyncStateRepository } from './repositories/mock-sync-state.repository';
import { MockCanonicalEntityRepository } from './repositories/mock-canonical-entity.repository';
import { MockMappingProfileRepository } from './repositories/mock-mapping-profile.repository';
import { MockGlobalMappingProfileRepository } from './repositories/mock-global-mapping-profile.repository';

/** Register once at the application boundary; HTTP providers can replace these bindings later. */
export function provideMockRepositories(): EnvironmentProviders {
  return makeEnvironmentProviders([
    MockDataService,
    { provide: TENANT_REPOSITORY, useClass: MockTenantRepository },
    { provide: SYNC_REQUEST_REPOSITORY, useClass: MockSyncRequestRepository },
    { provide: SYNC_ENTITY_REPOSITORY, useClass: MockSyncEntityRepository },
    { provide: CREDENTIAL_REPOSITORY, useClass: MockCredentialRepository },
    { provide: SYNC_STATE_REPOSITORY, useClass: MockSyncStateRepository },
    { provide: CANONICAL_ENTITY_REPOSITORY, useClass: MockCanonicalEntityRepository },
    { provide: MAPPING_PROFILE_REPOSITORY, useClass: MockMappingProfileRepository },
    { provide: GLOBAL_MAPPING_PROFILE_REPOSITORY, useClass: MockGlobalMappingProfileRepository },
  ]);
}
