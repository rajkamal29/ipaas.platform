import { InjectionToken } from '@angular/core';
import type { TenantRepository } from '../contracts/tenant.repository';
import type { SyncRequestRepository } from '../contracts/sync-request.repository';
import type { SyncEntityRepository } from '../contracts/sync-entity.repository';
import type { CredentialRepository } from '../contracts/credential.repository';
import type { SyncStateRepository } from '../contracts/sync-state.repository';
import type { CanonicalEntityRepository } from '../contracts/canonical-entity.repository';
import type { MappingProfileRepository } from '../contracts/mapping-profile.repository';
import type { GlobalMappingProfileRepository } from '../contracts/global-mapping-profile.repository';

export const TENANT_REPOSITORY = new InjectionToken<TenantRepository>('TenantRepository');
export const SYNC_REQUEST_REPOSITORY = new InjectionToken<SyncRequestRepository>(
  'SyncRequestRepository',
);
export const SYNC_ENTITY_REPOSITORY = new InjectionToken<SyncEntityRepository>(
  'SyncEntityRepository',
);
export const CREDENTIAL_REPOSITORY = new InjectionToken<CredentialRepository>(
  'CredentialRepository',
);
export const SYNC_STATE_REPOSITORY = new InjectionToken<SyncStateRepository>('SyncStateRepository');
export const CANONICAL_ENTITY_REPOSITORY = new InjectionToken<CanonicalEntityRepository>(
  'CanonicalEntityRepository',
);
export const MAPPING_PROFILE_REPOSITORY = new InjectionToken<MappingProfileRepository>(
  'MappingProfileRepository',
);
export const GLOBAL_MAPPING_PROFILE_REPOSITORY = new InjectionToken<GlobalMappingProfileRepository>(
  'GlobalMappingProfileRepository',
);
