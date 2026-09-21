import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { MockDataService } from './mock/mock-data.service';
import { MockCanonicalEntityRepository } from './mock/repositories/mock-canonical-entity.repository';
import { MockCredentialRepository } from './mock/repositories/mock-credential.repository';
import { MockGlobalMappingProfileRepository } from './mock/repositories/mock-global-mapping-profile.repository';
import { MockMappingProfileRepository } from './mock/repositories/mock-mapping-profile.repository';
import { MockSyncStateRepository } from './mock/repositories/mock-sync-state.repository';
import { HttpSyncEntityRepository } from './http/repositories/http-sync-entity.repository';
import { HttpSyncRequestRepository } from './http/repositories/http-sync-request.repository';
import { HttpTenantRepository } from './http/repositories/http-tenant.repository';
import {
  CANONICAL_ENTITY_REPOSITORY,
  CREDENTIAL_REPOSITORY,
  GLOBAL_MAPPING_PROFILE_REPOSITORY,
  MAPPING_PROFILE_REPOSITORY,
  SYNC_ENTITY_REPOSITORY,
  SYNC_REQUEST_REPOSITORY,
  SYNC_STATE_REPOSITORY,
  TENANT_REPOSITORY,
} from './tokens/repository.tokens';

export function provideRepositories(): EnvironmentProviders {
  return makeEnvironmentProviders([
    MockDataService,
    { provide: TENANT_REPOSITORY, useClass: HttpTenantRepository },
    { provide: SYNC_REQUEST_REPOSITORY, useClass: HttpSyncRequestRepository },
    { provide: SYNC_ENTITY_REPOSITORY, useClass: HttpSyncEntityRepository },
    { provide: CREDENTIAL_REPOSITORY, useClass: MockCredentialRepository },
    { provide: SYNC_STATE_REPOSITORY, useClass: MockSyncStateRepository },
    { provide: CANONICAL_ENTITY_REPOSITORY, useClass: MockCanonicalEntityRepository },
    { provide: MAPPING_PROFILE_REPOSITORY, useClass: MockMappingProfileRepository },
    { provide: GLOBAL_MAPPING_PROFILE_REPOSITORY, useClass: MockGlobalMappingProfileRepository },
  ]);
}
