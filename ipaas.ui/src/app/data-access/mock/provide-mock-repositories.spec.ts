import { TestBed } from '@angular/core/testing';
import { appConfig } from '../../app.config';
import type { TenantRepository } from '../contracts/tenant.repository';
import {
  CANONICAL_ENTITY_REPOSITORY,
  CREDENTIAL_REPOSITORY,
  GLOBAL_MAPPING_PROFILE_REPOSITORY,
  MAPPING_PROFILE_REPOSITORY,
  SYNC_ENTITY_REPOSITORY,
  SYNC_REQUEST_REPOSITORY,
  SYNC_STATE_REPOSITORY,
  TENANT_REPOSITORY,
} from '../tokens/repository.tokens';
import { createMockFixtures, FIXTURE_IDS } from './fixtures/mock-fixtures';
import { MOCK_DATA_SEED, MockDataService } from './mock-data.service';
import { provideMockRepositories } from './provide-mock-repositories';

describe('Repository dependency injection', () => {
  it('binds all eight contracts in the actual application configuration', () => {
    TestBed.configureTestingModule({ providers: appConfig.providers });
    expect(TestBed.inject(TENANT_REPOSITORY)).toBeDefined();
    expect(TestBed.inject(SYNC_REQUEST_REPOSITORY)).toBeDefined();
    expect(TestBed.inject(SYNC_ENTITY_REPOSITORY)).toBeDefined();
    expect(TestBed.inject(CREDENTIAL_REPOSITORY)).toBeDefined();
    expect(TestBed.inject(SYNC_STATE_REPOSITORY)).toBeDefined();
    expect(TestBed.inject(CANONICAL_ENTITY_REPOSITORY)).toBeDefined();
    expect(TestBed.inject(MAPPING_PROFILE_REPOSITORY)).toBeDefined();
    expect(TestBed.inject(GLOBAL_MAPPING_PROFILE_REPOSITORY)).toBeDefined();
  });

  it('allows replacing a repository binding without changing its consumer', async () => {
    const fixtureTenant = createMockFixtures().tenants[0];
    if (!fixtureTenant) throw new Error('Fixture tenant is missing.');
    const replacement: TenantRepository = {
      list: async () => [fixtureTenant],
      get: async () => fixtureTenant,
      create: async () => fixtureTenant,
      update: async () => fixtureTenant,
      delete: async () => undefined,
    };
    TestBed.configureTestingModule({
      providers: [provideMockRepositories(), { provide: TENANT_REPOSITORY, useValue: replacement }],
    });
    expect(TestBed.inject(TENANT_REPOSITORY)).toBe(replacement);
    expect(await TestBed.inject(TENANT_REPOSITORY).list()).toEqual([fixtureTenant]);
  });

  it('copies seed data and snapshots so external mutations cannot change repositories', async () => {
    const seed = createMockFixtures();
    TestBed.configureTestingModule({
      providers: [provideMockRepositories(), { provide: MOCK_DATA_SEED, useValue: seed }],
    });
    const repository = TestBed.inject(TENANT_REPOSITORY);
    const store = TestBed.inject(MockDataService);
    seed.tenants.length = 0;
    store.snapshot().tenants.length = 0;
    expect(await repository.list()).toHaveLength(2);
  });

  it('rejects an invalid synthetic seed before exposing an incoherent store', () => {
    const seed = createMockFixtures();
    seed.tenants = seed.tenants.filter((row) => row.id !== FIXTURE_IDS.tenantA);
    TestBed.configureTestingModule({
      providers: [provideMockRepositories(), { provide: MOCK_DATA_SEED, useValue: seed }],
    });
    expect(() => TestBed.inject(MockDataService)).toThrow(
      expect.objectContaining({ code: 'validation' }),
    );
  });
});
