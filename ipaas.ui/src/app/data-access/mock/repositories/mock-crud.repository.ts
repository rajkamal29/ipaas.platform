import { inject } from '@angular/core';
import { isUuid } from '../../../domain/validation/model-validation';
import type { CrudRepository } from '../../contracts/crud-repository';
import { RepositoryError } from '../../contracts/repository-error';
import { MockDataService } from '../mock-data.service';
import type { CrudTable, MockDatabase, MockTables } from '../mock-database';

export function assertId(id: string): void {
  if (!isUuid(id))
    throw new RepositoryError('validation', 'Expected a UUID string.', [
      { field: 'id', code: 'value', message: 'Expected a UUID string.' },
    ]);
}

function assertInput(input: unknown): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RepositoryError('validation', 'Expected an input object.');
  }
}

function cascade(database: MockDatabase, table: CrudTable, id: string): void {
  if (table === 'tenants') {
    const requests = database.syncRequests.filter((row) => row.tenantId === id);
    for (const request of requests) cascade(database, 'syncRequests', request.id);
    database.syncRequests = database.syncRequests.filter((row) => row.tenantId !== id);
    database.credentials = database.credentials.filter((row) => row.tenantId !== id);
    database.mappingProfiles = database.mappingProfiles.filter((row) => row.tenantId !== id);
  } else if (table === 'syncRequests') {
    const entityIds = new Set(
      database.syncEntities.filter((row) => row.syncRequestId === id).map((row) => row.id),
    );
    database.syncStates = database.syncStates.filter((row) => !entityIds.has(row.syncEntityId));
    database.syncEntities = database.syncEntities.filter((row) => row.syncRequestId !== id);
  } else if (table === 'syncEntities') {
    database.syncStates = database.syncStates.filter((row) => row.syncEntityId !== id);
  }
}

/** Shared mechanics only; each concrete repository owns its input projection and queries. */
export abstract class MockCrudRepository<
  K extends CrudTable,
  Create,
  Update,
  Filter,
> implements CrudRepository<MockTables[K], Create, Update, Filter> {
  protected readonly data = inject(MockDataService);

  protected constructor(private readonly table: K) {}

  protected abstract build(input: Create, id: string, now: string): MockTables[K];
  protected abstract replace(row: MockTables[K], input: Update, now: string): MockTables[K];
  protected abstract matches(row: MockTables[K], filter: Filter, database: MockDatabase): boolean;

  async list(filter?: Filter): Promise<readonly MockTables[K][]> {
    if (filter !== undefined) assertInput(filter);
    const snapshot = this.data.snapshot();
    return snapshot[this.table].filter(
      (row) => filter === undefined || this.matches(row, filter, snapshot),
    );
  }

  async get(id: string): Promise<MockTables[K] | null> {
    assertId(id);
    return this.data.read(this.table).find((row) => row.id === id) ?? null;
  }

  async create(input: Create): Promise<MockTables[K]> {
    assertInput(input);
    return this.data.transaction((draft) => {
      const row = this.build(input, crypto.randomUUID(), new Date().toISOString());
      draft[this.table].push(row);
      return row;
    });
  }

  async update(id: string, input: Update): Promise<MockTables[K]> {
    assertId(id);
    assertInput(input);
    return this.data.transaction((draft) => {
      const index = draft[this.table].findIndex((row) => row.id === id);
      const existing = draft[this.table][index];
      if (!existing) throw new RepositoryError('not-found', 'The record does not exist.');
      const updated = this.replace(existing, input, new Date().toISOString());
      draft[this.table][index] = updated;
      return updated;
    });
  }

  async delete(id: string): Promise<void> {
    assertId(id);
    this.data.transaction((draft) => {
      const index = draft[this.table].findIndex((row) => row.id === id);
      if (index < 0) throw new RepositoryError('not-found', 'The record does not exist.');
      draft[this.table].splice(index, 1);
      cascade(draft, this.table, id);
    });
  }
}
