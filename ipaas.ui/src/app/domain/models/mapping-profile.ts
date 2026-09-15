import type { GlobalMappingProfile, MappingKey } from './global-mapping-profile';

export interface MappingProfile extends GlobalMappingProfile {
  readonly tenantId: string;
}

export interface TenantMappingKey extends MappingKey {
  readonly tenantId: string;
}

export type EffectiveMapping =
  | { readonly origin: 'tenant'; readonly profile: MappingProfile }
  | { readonly origin: 'global'; readonly profile: GlobalMappingProfile }
  | { readonly origin: 'missing'; readonly profile: null };
