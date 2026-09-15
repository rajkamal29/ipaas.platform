import { createMockFixtures } from '../../data-access/mock/fixtures/mock-fixtures';
import {
  ENTITY_TYPES,
  MAPPING_DIRECTIONS,
  PROVIDERS,
  SYNC_ENTITY_STATUSES,
  SYNC_RUN_STATUSES,
  SYNC_TYPES,
} from '../value-sets/database-values';
import {
  isJsonValue,
  isUuid,
  validateCanonicalEntity,
  validateCredential,
  validateGlobalMappingProfile,
  validateMappingProfile,
  validateSyncEntity,
  validateSyncRequest,
  validateSyncSchedule,
  validateSyncState,
  validateTenant,
} from './model-validation';

describe('Database-driven model validation', () => {
  const fixture = createMockFixtures();

  it.each([60, 300, 2147483647])('accepts interval cadence %s', (intervalSeconds) => {
    expect(validateSyncSchedule({ syncType: SYNC_TYPES.interval, intervalSeconds })).toEqual([]);
  });

  it.each([null, undefined, 0, 59, 60.5, 2147483648, Number.NaN, Infinity, '60'])(
    'rejects invalid interval cadence %s',
    (intervalSeconds) => {
      expect(validateSyncSchedule({ syncType: SYNC_TYPES.interval, intervalSeconds })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'intervalSeconds' })]),
      );
    },
  );

  for (const syncType of [SYNC_TYPES.oneTime, SYNC_TYPES.realTime]) {
    it(`requires null cadence for ${syncType}`, () => {
      expect(validateSyncSchedule({ syncType, intervalSeconds: null })).toEqual([]);
      for (const intervalSeconds of [0, 60, undefined]) {
        expect(validateSyncSchedule({ syncType, intervalSeconds }).length).toBeGreaterThan(0);
      }
    });
  }

  it('rejects unknown supported-value fields and accepts the complete value sets', () => {
    for (const provider of Object.values(PROVIDERS)) {
      expect(
        validateSyncRequest({ ...fixture.syncRequests[0], source: provider, target: provider }),
      ).toEqual([]);
    }
    for (const entity of Object.values(ENTITY_TYPES)) {
      expect(validateCanonicalEntity({ ...fixture.canonicalEntities[0], name: entity })).toEqual(
        [],
      );
    }
    for (const status of Object.values(SYNC_ENTITY_STATUSES)) {
      expect(validateSyncEntity({ ...fixture.syncEntities[0], status })).toEqual([]);
    }
    for (const lastRunStatus of Object.values(SYNC_RUN_STATUSES)) {
      expect(validateSyncState({ ...fixture.syncStates[0], lastRunStatus })).toEqual([]);
    }
    for (const direction of Object.values(MAPPING_DIRECTIONS)) {
      expect(
        validateGlobalMappingProfile({ ...fixture.globalMappingProfiles[0], direction }),
      ).toEqual([]);
    }
    expect(validateSyncRequest({ ...fixture.syncRequests[0], source: 'unsupported' })).not.toEqual(
      [],
    );
    expect(validateSyncEntity({ ...fixture.syncEntities[0], entity: 'unsupported' })).not.toEqual(
      [],
    );
    expect(validateSyncEntity({ ...fixture.syncEntities[0], status: 'unsupported' })).not.toEqual(
      [],
    );
    expect(validateSyncSchedule({ syncType: 'unsupported', intervalSeconds: null })).not.toEqual(
      [],
    );
    expect(
      validateSyncState({ ...fixture.syncStates[0], lastRunStatus: 'unsupported' }),
    ).not.toEqual([]);
    expect(
      validateMappingProfile({ ...fixture.mappingProfiles[0], direction: 'unsupported' }),
    ).not.toEqual([]);
    expect(validateCredential({ ...fixture.credentials[0], provider: 'unsupported' })).not.toEqual(
      [],
    );
  });

  it('requires metadata and fields but does not impose nonblank names or positive versions', () => {
    expect(validateTenant({ ...fixture.tenants[0], name: '' })).toEqual([]);
    expect(validateTenant({ ...fixture.tenants[0], name: '   ' })).toEqual([]);
    expect(validateTenant({ ...fixture.tenants[0], name: null })).not.toEqual([]);
    expect(validateTenant({ ...fixture.tenants[0], name: undefined })).not.toEqual([]);
    expect(validateTenant({ ...fixture.tenants[0], id: 'bad-id' })).not.toEqual([]);
    expect(validateTenant({ ...fixture.tenants[0], createdAt: 'bad-date' })).not.toEqual([]);
    expect(
      validateCanonicalEntity({ ...fixture.canonicalEntities[0], version: -1, schema: null }),
    ).toEqual([]);
    expect(validateCanonicalEntity({ ...fixture.canonicalEntities[0], version: 0 })).toEqual([]);
    expect(validateCanonicalEntity({ ...fixture.canonicalEntities[0], version: 1.5 })).not.toEqual(
      [],
    );
    expect(
      validateCanonicalEntity({ ...fixture.canonicalEntities[0], schema: undefined }),
    ).not.toEqual([]);
    expect(
      validateGlobalMappingProfile({ ...fixture.globalMappingProfiles[0], isActive: undefined }),
    ).not.toEqual([]);
    expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
  });

  it('preserves nullable state and permits arbitrary valid JSONB shapes', () => {
    expect(
      validateSyncState({
        ...fixture.syncStates[0],
        cursor: null,
        lastRunAt: null,
        lastRunStatus: null,
        lastError: null,
        failed: { diagnostic: 'arbitrary JSON, not an enforced array' },
        retry: null,
      }),
    ).toEqual([]);
    expect(
      validateGlobalMappingProfile({ ...fixture.globalMappingProfiles[0], fieldMappings: 42 }),
    ).toEqual([]);
    expect(validateSyncState({ ...fixture.syncStates[0], lastRunStatus: undefined })).not.toEqual(
      [],
    );
  });

  it('rejects non-JSON values and cycles without rejecting repeated object references', () => {
    const cycle: Record<string, unknown> = {};
    cycle['self'] = cycle;
    for (const invalid of [
      undefined,
      Number.NaN,
      Infinity,
      1n,
      () => 1,
      new Date(),
      cycle,
      [undefined],
      { value: undefined },
      new Array(2),
    ]) {
      expect(isJsonValue(invalid)).toBe(false);
    }
    const shared = { value: true };
    expect(isJsonValue([shared, shared, null, 42, 'text'])).toBe(true);
    expect(isJsonValue({ text: '\u0000' })).toBe(false);
  });
});
