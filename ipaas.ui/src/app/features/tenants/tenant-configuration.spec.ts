import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { App } from '../../app';
import { appConfig } from '../../app.config';
import { provideMockRepositories } from '../../data-access/mock/provide-mock-repositories';
import { TENANT_PATHS } from '../../core/config/navigation';
import { FIXTURE_IDS } from '../../data-access/mock/fixtures/mock-fixtures';
import {
  TENANT_REPOSITORY,
  SYNC_REQUEST_REPOSITORY,
  SYNC_ENTITY_REPOSITORY,
} from '../../data-access/tokens/repository.tokens';
import type { Tenant } from '../../domain/models/tenant';
import { RepositoryError } from '../../data-access/contracts/repository-error';
import {
  ENTITY_TYPES,
  PROVIDERS,
  SYNC_ENTITY_STATUSES,
  SYNC_TYPES,
} from '../../domain/value-sets/database-values';

describe('Tenant and sync configuration pages', () => {
  const ids = FIXTURE_IDS;
  const paths = TENANT_PATHS;
  const missingId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

  async function setup(url: string, arrange?: () => void, waitForLoad = true) {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [...appConfig.providers, provideMockRepositories()],
    }).compileComponents();
    arrange?.();
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const element = fixture.nativeElement as HTMLElement;
    const main = () => element.querySelector('main') as HTMLElement;
    fixture.detectChanges();
    await router.navigateByUrl(url);
    await settle(waitForLoad);

    async function settle(waitForRead = true) {
      await fixture.whenStable();
      fixture.detectChanges();
      if (waitForRead) {
        await vi.waitFor(() => {
          fixture.detectChanges();
          const status = main().querySelector('[role="status"]')?.textContent?.trim() ?? '';
          expect(status.startsWith('Loading')).toBe(false);
        });
      }
    }
    async function input(selector: string, value: string) {
      const control = main().querySelector<HTMLInputElement>(selector);
      if (!control) throw new Error('Missing input: ' + selector);
      control.value = value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
    }
    async function select(selector: string, label: string) {
      const control = main().querySelector<HTMLSelectElement>(selector);
      const option = Array.from(control?.options ?? []).find(
        (item) => item.textContent?.trim() === label,
      );
      if (!control || !option || option.disabled)
        throw new Error('Missing enabled option: ' + label);
      control.value = option.value;
      control.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
    }
    async function submit() {
      main()
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await settle();
    }
    return { fixture, router, main, settle, input, select, submit };
  }

  it('renders tenants from the repository with working detail and create links', async () => {
    const page = await setup(paths.list);
    expect(page.main().textContent).toContain('Example North');
    expect(page.main().textContent).toContain('Example South');
    expect(page.main().querySelector('a[href="' + paths.detail(ids.tenantA) + '"]')).not.toBeNull();
    expect(page.main().querySelector('a[href="' + paths.create + '"]')).not.toBeNull();
    expect(page.main().querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('shows loading then an empty state for an asynchronous repository', async () => {
    let resolve!: (value: readonly Tenant[]) => void;
    const pending = new Promise<readonly Tenant[]>((done) => {
      resolve = done;
    });
    const page = await setup(
      paths.list,
      () => {
        vi.spyOn(TestBed.inject(TENANT_REPOSITORY), 'list').mockReturnValueOnce(pending);
      },
      false,
    );
    expect(page.main().querySelector('[role="status"]')?.textContent).toContain('Loading tenants');
    resolve([]);
    await page.settle();
    expect(page.main().textContent).toContain('No tenants yet');
  });

  it('shows a safe error and retries a failed list load', async () => {
    const page = await setup(paths.list, () => {
      vi.spyOn(TestBed.inject(TENANT_REPOSITORY), 'list').mockRejectedValueOnce(
        new Error('private transport detail'),
      );
    });
    expect(page.main().querySelector('[role="alert"]')?.textContent).toContain(
      'Could not load tenants',
    );
    expect(page.main().textContent).not.toContain('private transport detail');
    page.main().querySelector<HTMLButtonElement>('app-feedback-panel button')?.click();
    await page.settle();
    expect(page.main().textContent).toContain('Example North');
  });

  it('creates a tenant through its repository and navigates to its empty detail', async () => {
    const page = await setup(paths.create);
    const repository = TestBed.inject(TENANT_REPOSITORY);
    const create = vi.spyOn(repository, 'create');
    await page.input('#tenant-name', 'Configuration team');
    await page.submit();
    expect(create).toHaveBeenCalledWith({ name: 'Configuration team' });
    const tenant = (await repository.list()).find((item) => item.name === 'Configuration team');
    expect(page.router.url).toBe(paths.detail(tenant!.id));
    expect(page.main().querySelector('h1')?.textContent).toBe('Configuration team');
    expect(page.main().textContent).toContain('No sync requests yet');
  });

  it('retains user input and shows repository duplicate-name feedback', async () => {
    const page = await setup(paths.create);
    await page.input('#tenant-name', 'Example North');
    await page.submit();
    expect(page.router.url).toBe(paths.create);
    expect(page.main().querySelector('[role="alert"]')?.textContent).toContain(
      'exact name already exists',
    );
    expect(page.main().querySelector<HTMLInputElement>('#tenant-name')?.value).toBe(
      'Example North',
    );
    expect(await TestBed.inject(TENANT_REPOSITORY).list()).toHaveLength(2);
  });

  it('prevents short and whitespace-only tenant names before repository submission', async () => {
    const page = await setup(paths.create);
    const create = vi.spyOn(TestBed.inject(TENANT_REPOSITORY), 'create');
    await page.input('#tenant-name', 'AB');
    await page.submit();
    expect(create).not.toHaveBeenCalled();
    expect(page.main().textContent).toContain('Name must be at least 3 characters.');
    await page.input('#tenant-name', '   ');
    await page.submit();
    expect(create).not.toHaveBeenCalled();
    expect(page.main().textContent).toContain('Name is required.');
  });

  it('shows a safe backend error message and request ID in the existing feedback panel', async () => {
    const page = await setup(paths.create, () => {
      vi.spyOn(TestBed.inject(TENANT_REPOSITORY), 'create').mockRejectedValueOnce(
        new RepositoryError(
          'server',
          'The tenant service is temporarily unavailable.',
          [],
          undefined,
          'request-123',
        ),
      );
    });
    await page.input('#tenant-name', 'Acme');
    await page.submit();
    expect(page.main().querySelector('[role="alert"]')?.textContent).toContain(
      'The tenant service is temporarily unavailable.',
    );
    expect(page.main().textContent).toContain('Request ID: request-123');
  });

  it('disables the form while saving and prevents duplicate submissions', async () => {
    let resolve!: (value: Tenant) => void;
    const pending = new Promise<Tenant>((done) => {
      resolve = done;
    });
    const page = await setup(paths.create);
    const create = vi
      .spyOn(TestBed.inject(TENANT_REPOSITORY), 'create')
      .mockReturnValueOnce(pending);
    await page.input('#tenant-name', 'Pending tenant');
    await page.submit();
    expect(page.main().querySelector('fieldset')?.disabled).toBe(true);
    expect(page.main().querySelector('form')?.getAttribute('aria-busy')).toBe('true');
    await page.submit();
    expect(create).toHaveBeenCalledTimes(1);
    await page.router.navigateByUrl(paths.list);
    resolve({ id: missingId, name: 'Pending tenant', createdAt: '2026-09-01T00:00:00Z' });
    await page.settle();
    expect(page.router.url).toBe(paths.list);
  });

  it('filters requests by tenant and reloads when the tenant route parameter changes', async () => {
    const page = await setup(paths.detail(ids.tenantA));
    expect(page.main().textContent).toContain(ids.requestA);
    expect(page.main().textContent).toContain(ids.requestC);
    expect(page.main().textContent).not.toContain(ids.requestB);
    await page.router.navigateByUrl(paths.detail(ids.tenantB));
    await page.settle();
    expect(page.main().querySelector('h1')?.textContent).toBe('Example South');
    expect(page.main().textContent).toContain(ids.requestB);
    expect(page.main().textContent).not.toContain(ids.requestA);
  });

  it('validates provider selections and creates a request in the current tenant', async () => {
    const page = await setup(paths.createRequest(ids.tenantA));
    const create = vi.spyOn(TestBed.inject(SYNC_REQUEST_REPOSITORY), 'create');
    await page.submit();
    expect(create).not.toHaveBeenCalled();
    expect(page.main().querySelector('#source-provider')?.getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(page.main().querySelector('[role="alert"]')?.textContent).toContain('Select a source');
    await page.select('#source-provider', 'ConnectWise');
    await page.select('#target-provider', 'Keka');
    await page.submit();
    expect(create).toHaveBeenCalledWith({
      tenantId: ids.tenantA,
      source: PROVIDERS.connectwise,
      target: PROVIDERS.keka,
    });
    const request = await create.mock.results[0]!.value;
    expect(page.router.url).toBe(paths.request(ids.tenantA, request.id));
    expect(page.main().textContent).toContain('No sync entities yet');
  });

  it('shows a safe API error when request creation fails', async () => {
    const page = await setup(paths.createRequest(ids.tenantA), () => {
      vi.spyOn(TestBed.inject(SYNC_REQUEST_REPOSITORY), 'create').mockRejectedValueOnce(
        new RepositoryError(
          'server',
          'The sync request service is temporarily unavailable.',
          [],
          undefined,
          'request-sync-123',
        ),
      );
    });
    await page.select('#source-provider', 'ConnectWise');
    await page.select('#target-provider', 'Keka');
    await page.submit();
    expect(page.router.url).toBe(paths.createRequest(ids.tenantA));
    expect(page.main().querySelector('[role="alert"]')?.textContent).toContain(
      'The sync request service is temporarily unavailable.',
    );
    expect(page.main().textContent).toContain('Request ID: request-sync-123');
  });

  it('shows request entities only and disables entity types already configured', async () => {
    const page = await setup(paths.request(ids.tenantA, ids.requestA));
    expect(page.main().querySelectorAll('tbody tr')).toHaveLength(2);
    expect(page.main().querySelector('tbody')?.textContent).toContain('Client');
    expect(page.main().querySelector('tbody')?.textContent).toContain('Timesheet');
    expect(page.main().querySelector('tbody')?.textContent).not.toContain('Project');
    expect(
      Array.from(page.main().querySelectorAll('thead th')).map((heading) => heading.textContent),
    ).toEqual([
      'Entity',
      'Sync type',
      'Interval',
      'Provisioning Status',
      'Configuration Updated At',
      'Execution Status',
      'Sync State Updated At',
      'Failed Count',
      'Retry Count',
    ]);
    const activeRow = page.main().querySelectorAll('tbody tr')[0]!;
    expect(activeRow.querySelector('[data-label="Execution Status"]')?.textContent).toContain(
      'Failed',
    );
    expect(
      activeRow
        .querySelector('[data-label="Sync State Updated At"] time')
        ?.getAttribute('datetime'),
    ).toBe('2026-09-01T10:00:00.000Z');
    expect(activeRow.querySelector('[data-label="Failed Count"]')?.textContent?.trim()).toBe('1');
    expect(activeRow.querySelector('[data-label="Retry Count"]')?.textContent?.trim()).toBe('1');
    await page.router.navigateByUrl(paths.createEntity(ids.tenantA, ids.requestA));
    await page.settle();
    const options = Array.from(
      page.main().querySelector<HTMLSelectElement>('#entity-type')!.options,
    );
    expect(options.find((option) => option.textContent?.includes('Client'))?.disabled).toBe(true);
    expect(options.find((option) => option.textContent?.includes('Project'))?.disabled).toBe(false);
    expect(page.main().querySelector('[formControlName="status"]')).toBeNull();
  });

  it('renders safe runtime defaults when a sync entity has no Sync State', async () => {
    const page = await setup(paths.request(ids.tenantB, ids.requestB));
    const submittedRow = page.main().querySelectorAll('tbody tr')[0]!;
    expect(submittedRow.querySelector('[data-label="Execution Status"]')?.textContent).toContain(
      'Not available',
    );
    expect(
      submittedRow.querySelector('[data-label="Sync State Updated At"]')?.textContent,
    ).toContain('Not available');
    expect(submittedRow.querySelector('[data-label="Failed Count"]')?.textContent?.trim()).toBe(
      '0',
    );
    expect(submittedRow.querySelector('[data-label="Retry Count"]')?.textContent?.trim()).toBe('0');
  });

  it('enforces integer interval seconds and uses the repository default status', async () => {
    const page = await setup(paths.createEntity(ids.tenantA, ids.requestA));
    const create = vi.spyOn(TestBed.inject(SYNC_ENTITY_REPOSITORY), 'create');
    await page.select('#entity-type', 'Project');
    expect(page.main().querySelector('#interval-seconds')).toBeNull();
    await page.select('#sync-type', 'Interval');
    for (const value of ['', '59', '60.5', '2147483648']) {
      await page.input('#interval-seconds', value);
      await page.submit();
      expect(create).not.toHaveBeenCalled();
      expect(page.main().querySelector('#interval-errors')?.textContent).toContain(
        'integer seconds',
      );
    }
    await page.input('#interval-seconds', '60');
    await page.submit();
    expect(create).toHaveBeenCalledWith({
      syncRequestId: ids.requestA,
      tenantId: ids.tenantA,
      entity: ENTITY_TYPES.project,
      syncType: SYNC_TYPES.interval,
      intervalSeconds: 60,
    });
    const entity = await create.mock.results[0]!.value;
    expect(entity.status).toBe(SYNC_ENTITY_STATUSES.submitted);
    expect(page.router.url).toBe(paths.request(ids.tenantA, ids.requestA));
    expect(page.main().querySelector('tbody')?.textContent).toContain('Submitted');
  });

  it.each([
    ['One time', SYNC_TYPES.oneTime],
    ['Real time — Not yet supported', SYNC_TYPES.realTime],
  ] as const)('clears interval seconds when switching to %s', async (label, syncType) => {
    const page = await setup(paths.createEntity(ids.tenantA, ids.requestA));
    const create = vi.spyOn(TestBed.inject(SYNC_ENTITY_REPOSITORY), 'create');
    await page.select('#entity-type', 'Project');
    await page.select('#sync-type', 'Interval');
    await page.input('#interval-seconds', '120');
    await page.select('#sync-type', label);
    expect(page.main().querySelector('#interval-seconds')).toBeNull();
    if (syncType === SYNC_TYPES.realTime) {
      expect(page.main().querySelector('[role="status"]')?.textContent).toContain(
        'will not execute',
      );
    }
    await page.select('#sync-type', 'Interval');
    expect(page.main().querySelector<HTMLInputElement>('#interval-seconds')?.value).toBe('');
    await page.select('#sync-type', label);
    await page.submit();
    expect(create).toHaveBeenCalledWith({
      syncRequestId: ids.requestA,
      tenantId: ids.tenantA,
      entity: ENTITY_TYPES.project,
      syncType,
      intervalSeconds: null,
    });
    if (syncType === SYNC_TYPES.realTime)
      expect(page.main().querySelector('.support-label')?.textContent).toContain(
        'Not yet supported',
      );
  });

  it('handles a duplicate entity created after the form was loaded', async () => {
    const page = await setup(paths.createEntity(ids.tenantA, ids.requestA));
    await page.select('#entity-type', 'Project');
    await TestBed.inject(SYNC_ENTITY_REPOSITORY).create({
      syncRequestId: ids.requestA,
      entity: ENTITY_TYPES.project,
      syncType: SYNC_TYPES.oneTime,
      intervalSeconds: null,
    });
    await page.submit();
    expect(page.router.url).toBe(paths.createEntity(ids.tenantA, ids.requestA));
    expect(page.main().querySelector('[role="alert"]')?.textContent).toContain(
      'already configured',
    );
    expect(
      await TestBed.inject(SYNC_ENTITY_REPOSITORY).list({ syncRequestId: ids.requestA }),
    ).toHaveLength(3);
  });

  it('shows a safe API error when entity creation fails', async () => {
    const page = await setup(paths.createEntity(ids.tenantA, ids.requestA), () => {
      vi.spyOn(TestBed.inject(SYNC_ENTITY_REPOSITORY), 'create').mockRejectedValueOnce(
        new RepositoryError(
          'server',
          'The sync entity service is temporarily unavailable.',
          [],
          undefined,
          'request-entity-123',
        ),
      );
    });
    await page.select('#entity-type', 'Project');
    await page.submit();
    expect(page.router.url).toBe(paths.createEntity(ids.tenantA, ids.requestA));
    expect(page.main().querySelector('[role="alert"]')?.textContent).toContain(
      'The sync entity service is temporarily unavailable.',
    );
    expect(page.main().textContent).toContain('Request ID: request-entity-123');
  });

  it.each([
    [paths.detail('invalid'), 'invalid ID'],
    [paths.detail(missingId), 'not found'],
    [paths.createRequest(missingId), 'not found'],
    [paths.request(ids.tenantA, 'invalid'), 'invalid ID'],
    [paths.request(ids.tenantA, missingId), 'not found'],
    [paths.request(ids.tenantA, ids.requestB), 'does not belong'],
    [paths.createEntity(ids.tenantA, ids.requestB), 'does not belong'],
  ])('rejects invalid or mismatched context at %s', async (url, message) => {
    const page = await setup(url);
    expect(page.main().querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(page.main().querySelector('form')).toBeNull();
    expect(page.main().querySelector('tbody')).toBeNull();
    expect(page.main().querySelector('app-feedback-panel button')).toBeNull();
  });
});
