import { TestBed } from '@angular/core/testing';
import type { Credential } from '../../../domain/models/credential';
import type { JsonValue } from '../../../domain/models/json-value';
import type { CreateSyncEntity } from '../../contracts/sync-entity.repository';
import {
  ENTITY_TYPES,
  MAPPING_DIRECTIONS,
  PROVIDERS,
  SYNC_ENTITY_STATUSES,
  SYNC_TYPES,
} from '../../../domain/value-sets/database-values';
import {
  CANONICAL_ENTITY_REPOSITORY,
  CREDENTIAL_REPOSITORY,
  GLOBAL_MAPPING_PROFILE_REPOSITORY,
  MAPPING_PROFILE_REPOSITORY,
  SYNC_ENTITY_REPOSITORY,
  SYNC_REQUEST_REPOSITORY,
  SYNC_STATE_REPOSITORY,
  TENANT_REPOSITORY,
} from '../../tokens/repository.tokens';
import { createMockFixtures, FIXTURE_IDS } from '../fixtures/mock-fixtures';
import { MOCK_DATA_SEED, MockDataService } from '../mock-data.service';
import { provideMockRepositories } from '../provide-mock-repositories';

const absentId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const clientInbound = {
  provider: PROVIDERS.connectwise,
  entity: ENTITY_TYPES.client,
  direction: MAPPING_DIRECTIONS.inbound,
} as const;

function repositories() {
  return {
    tenants: TestBed.inject(TENANT_REPOSITORY),
    requests: TestBed.inject(SYNC_REQUEST_REPOSITORY),
    entities: TestBed.inject(SYNC_ENTITY_REPOSITORY),
    credentials: TestBed.inject(CREDENTIAL_REPOSITORY),
    states: TestBed.inject(SYNC_STATE_REPOSITORY),
    canonical: TestBed.inject(CANONICAL_ENTITY_REPOSITORY),
    mappings: TestBed.inject(MAPPING_PROFILE_REPOSITORY),
    globals: TestBed.inject(GLOBAL_MAPPING_PROFILE_REPOSITORY),
    data: TestBed.inject(MockDataService),
  };
}

describe('Shared mock repositories', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideMockRepositories()] }));

  it('performs tenant CRUD with generated metadata and detached results', async () => {
    const { tenants } = repositories();
    const pending = tenants.create({ name: 'Example New' });
    expect(pending).toBeInstanceOf(Promise);
    const created = await pending;
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
    expect(await tenants.get(created.id)).toEqual(created);
    const updated = await tenants.update(created.id, { name: 'Example Renamed' });
    expect(updated).toEqual({ ...created, name: 'Example Renamed' });
    expect(await tenants.list({ name: 'Example Renamed' })).toEqual([updated]);
    Object.assign(updated, { name: 'Must not leak' });
    expect((await tenants.get(created.id))?.name).toBe('Example Renamed');
    await tenants.delete(created.id);
    expect(await tenants.get(created.id)).toBeNull();
  });

  it('distinguishes missing reads from missing writes and validates UUIDs', async () => {
    const { tenants } = repositories();
    expect(await tenants.get(absentId)).toBeNull();
    await expect(tenants.update(absentId, { name: 'Missing' })).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(tenants.delete(absentId)).rejects.toMatchObject({ code: 'not-found' });
    await expect(tenants.get('invalid')).rejects.toMatchObject({ code: 'validation' });
  });

  it('rejects duplicate names without partial writes, while permitting case and blank names', async () => {
    const { tenants, data } = repositories();
    const before = data.snapshot();
    await expect(tenants.create({ name: 'Example North' })).rejects.toMatchObject({
      code: 'conflict',
    });
    await expect(
      tenants.update(FIXTURE_IDS.tenantB, { name: 'Example North' }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(data.snapshot()).toEqual(before);
    await expect(tenants.create({ name: '' })).resolves.toMatchObject({ name: '' });
    await expect(tenants.create({ name: 'example north' })).resolves.toMatchObject({
      name: 'example north',
    });
  });

  it('shares newly created relationships and permits repeated same-provider requests', async () => {
    const { tenants, requests, entities } = repositories();
    const tenant = await tenants.create({ name: 'Example Linked' });
    const input = { tenantId: tenant.id, source: PROVIDERS.keka, target: PROVIDERS.keka };
    const request = await requests.create(input);
    await requests.create(input);
    expect(await requests.list({ tenantId: tenant.id })).toHaveLength(2);
    const entity = await entities.create({
      syncRequestId: request.id,
      entity: ENTITY_TYPES.client,
      syncType: SYNC_TYPES.interval,
      intervalSeconds: 60,
    });
    expect(entity.status).toBe(SYNC_ENTITY_STATUSES.submitted);
    expect(await entities.list({ tenantId: tenant.id })).toEqual([
      {
        ...entity,
        lastRunStatus: null,
        syncStateUpdatedAt: null,
        failedCount: 0,
        retryCount: 0,
      },
    ]);
    expect(
      await entities.list({ tenantId: FIXTURE_IDS.tenantB, syncRequestId: request.id }),
    ).toEqual([]);
    const changed = await requests.update(request.id, {
      source: PROVIDERS.connectwise,
      target: PROVIDERS.keka,
    });
    expect((await requests.get(request.id))?.source).toBe(PROVIDERS.connectwise);
    expect(changed.tenantId).toBe(tenant.id);
    expect(await requests.list({ tenantId: tenant.id, source: PROVIDERS.connectwise })).toEqual([
      changed,
    ]);
  });

  it('supports entity updates, relationship queries, and database scheduling constraints', async () => {
    const { entities } = repositories();
    const updated = await entities.update(FIXTURE_IDS.activeEntity, {
      entity: ENTITY_TYPES.client,
      syncType: SYNC_TYPES.oneTime,
      intervalSeconds: null,
      status: SYNC_ENTITY_STATUSES.completed,
    });
    expect(updated.syncRequestId).toBe(FIXTURE_IDS.requestA);
    expect(await entities.get(updated.id)).toMatchObject({
      ...updated,
      lastRunStatus: 'failed',
      failedCount: 1,
      retryCount: 1,
    });
    expect(
      await entities.list({
        syncRequestId: FIXTURE_IDS.requestA,
        status: SYNC_ENTITY_STATUSES.completed,
      }),
    ).toHaveLength(2);
    expect(await entities.list({ syncType: SYNC_TYPES.realTime })).toHaveLength(1);
    await expect(
      entities.create({
        syncRequestId: FIXTURE_IDS.requestA,
        entity: ENTITY_TYPES.project,
        syncType: SYNC_TYPES.interval,
        intervalSeconds: 59,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      issues: expect.arrayContaining([expect.objectContaining({ field: 'intervalSeconds' })]),
    });
    const invalid = {
      syncRequestId: FIXTURE_IDS.requestA,
      entity: ENTITY_TYPES.project,
      syncType: SYNC_TYPES.oneTime,
      intervalSeconds: 60,
    } as unknown as CreateSyncEntity;
    await expect(entities.create(invalid)).rejects.toMatchObject({ code: 'validation' });
  });

  it('rejects duplicate entity keys and dangling foreign keys atomically', async () => {
    const { entities, requests, mappings, data } = repositories();
    const before = data.snapshot();
    await expect(
      entities.create({
        syncRequestId: FIXTURE_IDS.requestA,
        entity: ENTITY_TYPES.client,
        syncType: SYNC_TYPES.oneTime,
        intervalSeconds: null,
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      constraint: 'sync_entities_request_entity_unique',
    });
    await expect(
      requests.create({
        tenantId: absentId,
        source: PROVIDERS.connectwise,
        target: PROVIDERS.keka,
      }),
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(
      entities.create({
        syncRequestId: absentId,
        entity: ENTITY_TYPES.client,
        syncType: SYNC_TYPES.oneTime,
        intervalSeconds: null,
      }),
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(
      mappings.create({ tenantId: absentId, ...clientInbound, version: 1, fieldMappings: [] }),
    ).rejects.toMatchObject({ code: 'validation' });
    expect(data.snapshot()).toEqual(before);
  });

  it('cascades tenant deletion across requests, entities, state, credentials, and overrides only', async () => {
    const { tenants, requests, entities, states, credentials, mappings, globals, canonical, data } =
      repositories();
    const globalBefore = await globals.list();
    const canonicalBefore = await canonical.list();
    await tenants.delete(FIXTURE_IDS.tenantA);
    expect(await requests.list({ tenantId: FIXTURE_IDS.tenantA })).toEqual([]);
    expect(await entities.list({ tenantId: FIXTURE_IDS.tenantA })).toEqual([]);
    expect(await entities.get(FIXTURE_IDS.activeEntity)).toBeNull();
    expect(await states.getForEntity(FIXTURE_IDS.activeEntity)).toBeNull();
    expect(await mappings.list({ tenantId: FIXTURE_IDS.tenantA })).toEqual([]);
    expect(data.read('credentials')).toEqual([]);
    await expect(credentials.list(FIXTURE_IDS.tenantA)).rejects.toMatchObject({
      code: 'not-found',
    });
    expect(await tenants.get(FIXTURE_IDS.tenantB)).not.toBeNull();
    expect(await entities.list({ tenantId: FIXTURE_IDS.tenantB })).toHaveLength(2);
    expect(await globals.list()).toEqual(globalBefore);
    expect(await canonical.list()).toEqual(canonicalBefore);
  });

  it('cascades request deletion without deleting its tenant or shared credentials', async () => {
    const { requests, entities, states, tenants, credentials } = repositories();
    await requests.delete(FIXTURE_IDS.requestA);
    expect(await requests.get(FIXTURE_IDS.requestA)).toBeNull();
    expect(await entities.list({ syncRequestId: FIXTURE_IDS.requestA })).toEqual([]);
    expect(await states.getForEntity(FIXTURE_IDS.activeEntity)).toBeNull();
    expect(await tenants.get(FIXTURE_IDS.tenantA)).not.toBeNull();
    expect(await credentials.list(FIXTURE_IDS.tenantA)).toHaveLength(2);
  });

  it('cascades entity deletion to its state, retaining the request', async () => {
    const { entities, states, requests } = repositories();
    await entities.delete(FIXTURE_IDS.activeEntity);
    expect(await states.getForEntity(FIXTURE_IDS.activeEntity)).toBeNull();
    expect(await requests.get(FIXTURE_IDS.requestA)).not.toBeNull();
  });

  it('returns only explicit safe credential fields, even with extra fields in a synthetic seed', async () => {
    const seed = createMockFixtures();
    const first = seed.credentials[0];
    if (!first) throw new Error('Fixture credential is missing.');
    const extra = {
      ...first,
      encrypted_payload: 'synthetic-sentinel',
      iv: 'synthetic-sentinel',
      auth_tag: 'synthetic-sentinel',
    };
    seed.credentials[0] = extra;
    TestBed.overrideProvider(MOCK_DATA_SEED, { useValue: seed });
    const { credentials } = repositories();
    const configured = await credentials.getForProvider(FIXTURE_IDS.tenantA, PROVIDERS.connectwise);
    expect(Object.keys(configured).sort()).toEqual(
      ['id', 'tenantId', 'provider', 'state', 'createdAt', 'updatedAt'].sort(),
    );
    expect(configured.state).toBe('configured');
    expect(JSON.stringify(await credentials.list(FIXTURE_IDS.tenantA))).not.toContain(
      'synthetic-sentinel',
    );
    expect(await credentials.getForProvider(FIXTURE_IDS.tenantB, PROVIDERS.keka)).toEqual({
      id: null,
      tenantId: FIXTURE_IDS.tenantB,
      provider: PROVIDERS.keka,
      state: 'missing',
      createdAt: null,
      updatedAt: null,
    });
  });

  it('derives credential availability from the shared source without storing missing rows', async () => {
    const { credentials, data } = repositories();
    expect((await credentials.getForProvider(FIXTURE_IDS.tenantB, PROVIDERS.keka)).state).toBe(
      'missing',
    );
    const credential: Credential = {
      id: crypto.randomUUID(),
      tenantId: FIXTURE_IDS.tenantB,
      provider: PROVIDERS.keka,
      state: 'configured',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    data.transaction((draft) => draft.credentials.push(credential));
    expect(await credentials.getForProvider(FIXTURE_IDS.tenantB, PROVIDERS.keka)).toEqual(
      credential,
    );
    expect(await credentials.list(FIXTURE_IDS.tenantA)).toHaveLength(2);
    const before = data.snapshot();
    expect(() =>
      data.transaction((draft) =>
        draft.credentials.push({ ...credential, id: crypto.randomUUID() }),
      ),
    ).toThrow(expect.objectContaining({ code: 'conflict' }));
    expect(data.snapshot()).toEqual(before);
  });

  it('reads nullable latest state and distinguishes an absent state row', async () => {
    const { states, data } = repositories();
    expect(await states.getForEntity(FIXTURE_IDS.submittedEntity)).toBeNull();
    expect(await states.getForEntity(FIXTURE_IDS.provisioningEntity)).toMatchObject({
      cursor: null,
      lastRunAt: null,
      lastRunStatus: null,
      lastError: null,
      failed: [],
      retry: [],
    });
    const state = await states.getForEntity(FIXTURE_IDS.activeEntity);
    expect(state?.lastRunStatus).toBe('failed');
    expect(() =>
      data.transaction((draft) => {
        if (!state) throw new Error('Fixture state is missing.');
        draft.syncStates.push({ ...state, id: crypto.randomUUID() });
      }),
    ).toThrow(expect.objectContaining({ code: 'conflict' }));
    if (state) Object.assign(state, { lastError: 'Must not leak' });
    expect((await states.getForEntity(FIXTURE_IDS.activeEntity))?.lastError).not.toBe(
      'Must not leak',
    );
  });

  it('resolves tenant override before global default, ignoring inactive overrides', async () => {
    const { mappings } = repositories();
    expect(
      await mappings.resolveEffective({ tenantId: FIXTURE_IDS.tenantA, ...clientInbound }),
    ).toMatchObject({ origin: 'tenant', profile: { id: FIXTURE_IDS.tenantMapping } });
    expect(
      await mappings.resolveEffective({ tenantId: FIXTURE_IDS.tenantB, ...clientInbound }),
    ).toMatchObject({ origin: 'global', profile: { id: FIXTURE_IDS.globalMapping } });
    expect(
      await mappings.resolveEffective({
        tenantId: FIXTURE_IDS.tenantA,
        provider: PROVIDERS.keka,
        entity: ENTITY_TYPES.timesheet,
        direction: MAPPING_DIRECTIONS.inbound,
      }),
    ).toEqual({ origin: 'missing', profile: null });
    await expect(
      mappings.resolveEffective({ tenantId: absentId, ...clientInbound }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('inherits changed global defaults immediately without copying them into tenant mappings', async () => {
    const { mappings, globals } = repositories();
    const tenantRowsBefore = await mappings.list();
    const replacement = await globals.create({
      ...clientInbound,
      version: 2,
      fieldMappings: { synthetic: true },
      isActive: false,
    });
    await globals.activate(replacement.id);
    expect(
      await mappings.resolveEffective({ tenantId: FIXTURE_IDS.tenantB, ...clientInbound }),
    ).toMatchObject({
      origin: 'global',
      profile: { id: replacement.id, fieldMappings: { synthetic: true } },
    });
    expect((await globals.get(FIXTURE_IDS.globalMapping))?.isActive).toBe(false);
    expect(await mappings.list()).toEqual(tenantRowsBefore);
    expect(
      (await mappings.resolveEffective({ tenantId: FIXTURE_IDS.tenantA, ...clientInbound })).origin,
    ).toBe('tenant');
  });

  it('activates an override atomically, supports duplicate historical versions, and preserves tenant isolation', async () => {
    const { mappings } = repositories();
    const first = await mappings.create({
      tenantId: FIXTURE_IDS.tenantA,
      ...clientInbound,
      version: 2,
      fieldMappings: [],
      isActive: false,
    });
    await mappings.create({
      tenantId: FIXTURE_IDS.tenantA,
      ...clientInbound,
      version: 2,
      fieldMappings: [],
      isActive: false,
    });
    await mappings.activate(first.id);
    expect((await mappings.get(FIXTURE_IDS.tenantMapping))?.isActive).toBe(false);
    await mappings.activate(FIXTURE_IDS.inactiveMapping);
    expect((await mappings.get(first.id))?.isActive).toBe(true);
    expect(await mappings.list({ tenantId: FIXTURE_IDS.tenantA, isActive: true })).toHaveLength(1);
    const active = await mappings.get(first.id);
    if (!active) throw new Error('Active mapping is missing.');
    await mappings.update(first.id, { ...active, isActive: false });
    expect(
      (await mappings.resolveEffective({ tenantId: FIXTURE_IDS.tenantA, ...clientInbound })).origin,
    ).toBe('global');
    await mappings.delete(first.id);
    expect(await mappings.get(first.id)).toBeNull();
  });

  it('rejects competing active mappings without silently deactivating existing rows', async () => {
    const { mappings, globals, data } = repositories();
    const before = data.snapshot();
    await expect(
      mappings.create({
        tenantId: FIXTURE_IDS.tenantA,
        ...clientInbound,
        version: 3,
        fieldMappings: [],
      }),
    ).rejects.toMatchObject({ code: 'conflict', constraint: 'mapping_profiles_one_active_idx' });
    await expect(
      globals.create({ ...clientInbound, version: 3, fieldMappings: [] }),
    ).rejects.toMatchObject({
      code: 'conflict',
      constraint: 'global_mapping_profiles_one_active_idx',
    });
    await expect(globals.activate(absentId)).rejects.toMatchObject({ code: 'not-found' });
    expect(data.snapshot()).toEqual(before);
  });

  it('supports global mapping updates, filtering, deletion, and missing resolution', async () => {
    const { globals, mappings } = repositories();
    const current = await globals.get(FIXTURE_IDS.globalMapping);
    if (!current) throw new Error('Fixture mapping is missing.');
    const updated = await globals.update(current.id, {
      ...current,
      version: 0,
      fieldMappings: null,
    });
    expect(updated.version).toBe(0);
    expect(await globals.list({ ...clientInbound, isActive: true })).toEqual([updated]);
    await globals.delete(current.id);
    expect(
      await mappings.resolveEffective({ tenantId: FIXTURE_IDS.tenantB, ...clientInbound }),
    ).toEqual({ origin: 'missing', profile: null });
  });

  it('supports canonical CRUD and preserves JSON snapshots and unconstrained schema versions', async () => {
    const { canonical, mappings } = repositories();
    const schema = { properties: { label: { type: 'string' } } };
    const created = await canonical.create({ name: ENTITY_TYPES.client, version: -1, schema });
    schema.properties.label.type = 'number';
    expect((await canonical.get(created.id))?.schema).toEqual({
      properties: { label: { type: 'string' } },
    });
    const read = await canonical.get(created.id);
    if (read?.schema && typeof read.schema === 'object')
      Object.assign(read.schema, { leaked: true });
    expect((await canonical.get(created.id))?.schema).not.toHaveProperty('leaked');
    const updated = await canonical.update(created.id, {
      name: ENTITY_TYPES.client,
      version: 0,
      schema: null,
    });
    expect(await canonical.list({ name: ENTITY_TYPES.client, version: 0 })).toEqual([updated]);
    await expect(
      canonical.create({ name: ENTITY_TYPES.client, version: 0, schema: {} }),
    ).rejects.toMatchObject({ code: 'conflict' });
    await canonical.delete(created.id);
    expect(await canonical.get(created.id)).toBeNull();
    expect(
      (await mappings.resolveEffective({ tenantId: FIXTURE_IDS.tenantA, ...clientInbound })).origin,
    ).toBe('tenant');
  });

  it('rejects non-JSON mutations before committing and does not leak raw cloning errors', async () => {
    const { canonical, data } = repositories();
    const before = data.snapshot();
    await expect(
      canonical.create({
        name: ENTITY_TYPES.client,
        version: 9,
        schema: { invalid: undefined } as unknown as JsonValue,
      }),
    ).rejects.toMatchObject({ code: 'validation' });
    expect(data.snapshot()).toEqual(before);
  });
});
