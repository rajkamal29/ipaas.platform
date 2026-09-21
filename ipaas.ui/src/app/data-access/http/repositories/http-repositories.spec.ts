import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG, type AppConfig } from '../../../core/config/app-config';
import { RepositoryError } from '../../contracts/repository-error';
import { HttpSyncEntityRepository } from './http-sync-entity.repository';
import { HttpSyncRequestRepository } from './http-sync-request.repository';
import { HttpTenantRepository } from './http-tenant.repository';

const config: AppConfig = {
  production: false,
  appName: 'test',
  dataMode: 'http',
  apiBaseUrl: '/api',
};
const tenantId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-17T00:00:00.000Z';
const tenant = { id: tenantId, name: 'Acme', createdAt: timestamp };
const syncRequest = {
  id: requestId,
  tenantId,
  source: 'connectwise' as const,
  target: 'keka' as const,
  createdAt: timestamp,
};
const syncEntity = {
  id: entityId,
  syncRequestId: requestId,
  entity: 'client' as const,
  syncType: 'interval' as const,
  intervalSeconds: 60,
  status: 'active' as const,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const syncEntityRead = {
  ...syncEntity,
  lastRunStatus: 'failed' as const,
  syncStateUpdatedAt: '2026-09-17T01:00:00.000Z',
  failedCount: 2,
  retryCount: 1,
};

describe('Issue #13 HTTP repositories', () => {
  let http: HttpTestingController;
  let tenants: HttpTenantRepository;
  let requests: HttpSyncRequestRepository;
  let entities: HttpSyncEntityRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: config },
        HttpTenantRepository,
        HttpSyncRequestRepository,
        HttpSyncEntityRepository,
      ],
    });
    http = TestBed.inject(HttpTestingController);
    tenants = TestBed.inject(HttpTenantRepository);
    requests = TestBed.inject(HttpSyncRequestRepository);
    entities = TestBed.inject(HttpSyncEntityRepository);
  });

  afterEach(() => http.verify());

  it('unwraps tenant list/create/update envelopes', async () => {
    const list = tenants.list({ name: 'Acme' });
    const listRequest = http.expectOne('/api/tenants?name=Acme');
    expect(listRequest.request.method).toBe('GET');
    listRequest.flush({ data: [tenant], timestamp });
    await expect(list).resolves.toEqual([tenant]);

    const create = tenants.create({ name: 'Acme' });
    const createRequest = http.expectOne('/api/tenants');
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body).toEqual({ name: 'Acme' });
    createRequest.flush({ data: tenant, timestamp });
    await expect(create).resolves.toEqual(tenant);

    const update = tenants.update(tenantId, { name: 'Acme updated' });
    const updateRequest = http.expectOne(`/api/tenants/${tenantId}`);
    expect(updateRequest.request.method).toBe('PUT');
    updateRequest.flush({ data: { ...tenant, name: 'Acme updated' }, timestamp });
    await expect(update).resolves.toMatchObject({ name: 'Acme updated' });
  });

  it('uses nested request URLs for list/create/get/update', async () => {
    const list = requests.list({ tenantId, source: 'connectwise', target: 'keka' });
    http
      .expectOne(`/api/tenants/${tenantId}/sync-requests?source=connectwise&target=keka`)
      .flush({ data: [syncRequest], timestamp });
    await expect(list).resolves.toEqual([syncRequest]);

    const create = requests.create({ tenantId, source: 'connectwise', target: 'keka' });
    const createRequest = http.expectOne(`/api/tenants/${tenantId}/sync-requests`);
    expect(createRequest.request.body).toEqual({ source: 'connectwise', target: 'keka' });
    createRequest.flush({ data: syncRequest, timestamp });
    await expect(create).resolves.toEqual(syncRequest);

    const get = requests.get(requestId, tenantId);
    http
      .expectOne(`/api/tenants/${tenantId}/sync-requests/${requestId}`)
      .flush({ data: syncRequest, timestamp });
    await expect(get).resolves.toEqual(syncRequest);

    const update = requests.update(requestId, { source: 'keka', target: 'connectwise' }, tenantId);
    const updateRequest = http.expectOne(`/api/tenants/${tenantId}/sync-requests/${requestId}`);
    expect(updateRequest.request.method).toBe('PUT');
    updateRequest.flush({
      data: { ...syncRequest, source: 'keka', target: 'connectwise' },
      timestamp,
    });
    await expect(update).resolves.toMatchObject({ source: 'keka', target: 'connectwise' });
  });

  it('maps enriched entity list/get responses without an additional state request', async () => {
    const context = { tenantId, syncRequestId: requestId };
    const list = entities.list(context);
    http
      .expectOne(`/api/tenants/${tenantId}/sync-requests/${requestId}/entities`)
      .flush({ data: [syncEntityRead], timestamp });
    await expect(list).resolves.toEqual([syncEntityRead]);

    const get = entities.get(entityId, context);
    http
      .expectOne(`/api/tenants/${tenantId}/sync-requests/${requestId}/entities/${entityId}`)
      .flush({ data: syncEntityRead, timestamp });
    await expect(get).resolves.toEqual(syncEntityRead);
  });

  it('keeps entity create/update requests and responses free of runtime state', async () => {
    const context = { tenantId, syncRequestId: requestId };

    const create = entities.create({
      ...context,
      entity: 'client',
      syncType: 'interval',
      intervalSeconds: 60,
    });
    const createRequest = http.expectOne(
      `/api/tenants/${tenantId}/sync-requests/${requestId}/entities`,
    );
    expect(createRequest.request.body).toEqual({
      entity: 'client',
      syncType: 'interval',
      intervalSeconds: 60,
    });
    createRequest.flush({ data: syncEntity, timestamp });
    await expect(create).resolves.toEqual(syncEntity);

    const update = entities.update(
      entityId,
      {
        entity: 'client',
        syncType: 'one_time',
        intervalSeconds: null,
        status: 'completed',
        lastRunStatus: 'failed',
        syncStateUpdatedAt: timestamp,
        failedCount: 4,
        retryCount: 3,
      } as Parameters<HttpSyncEntityRepository['update']>[1],
      context,
    );
    const updateRequest = http.expectOne(
      `/api/tenants/${tenantId}/sync-requests/${requestId}/entities/${entityId}`,
    );
    expect(updateRequest.request.method).toBe('PUT');
    expect(updateRequest.request.body).toEqual({
      entity: 'client',
      syncType: 'one_time',
      intervalSeconds: null,
      status: 'completed',
    });
    updateRequest.flush({
      data: {
        ...syncEntity,
        syncType: 'one_time',
        intervalSeconds: null,
        status: 'completed',
      },
      timestamp,
    });
    await expect(update).resolves.toMatchObject({ syncType: 'one_time', status: 'completed' });
  });

  it('maps the safe API error envelope without exposing the raw response', async () => {
    const result = tenants.create({ name: 'Duplicate' });
    http.expectOne('/api/tenants').flush(
      {
        error: {
          code: 'conflict',
          message: 'A tenant with this exact name already exists.',
          details: [],
          requestId: 'request-123',
        },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await expect(result).rejects.toEqual(
      expect.objectContaining<Partial<RepositoryError>>({
        code: 'conflict',
        message: 'A tenant with this exact name already exists.',
        requestId: 'request-123',
      }),
    );
  });
});
