import { inject, Injectable, InjectionToken } from '@angular/core';
import { createMockFixtures } from './fixtures/mock-fixtures';
import type { MockDatabase, MockTable, MockTables } from './mock-database';
import { validateMockDatabase } from './mock-database.validation';

export const MOCK_DATA_SEED = new InjectionToken<MockDatabase>('Synthetic mock data seed', {
  factory: createMockFixtures,
});

/** Temporary repository backing data. Components inject repository tokens, never this service. */
@Injectable()
export class MockDataService {
  private data: MockDatabase;

  constructor() {
    const initial = inject(MOCK_DATA_SEED);
    validateMockDatabase(initial);
    this.data = structuredClone(initial);
  }

  snapshot(): MockDatabase {
    return structuredClone(this.data);
  }

  read<K extends MockTable>(table: K): readonly MockTables[K][] {
    return structuredClone(this.data[table]);
  }

  /** Synchronous copy/validate/commit prevents partial mutations and shared-reference leaks. */
  transaction<Result>(mutate: (draft: MockDatabase) => Result): Result {
    const draft = this.snapshot();
    const result = mutate(draft);
    validateMockDatabase(draft);
    const detachedResult = structuredClone(result);
    this.data = structuredClone(draft);
    return detachedResult;
  }
}
