import { inject, Injectable } from '@angular/core';
import type { Credential, CredentialView } from '../../../domain/models/credential';
import { PROVIDERS } from '../../../domain/value-sets/database-values';
import type { Provider } from '../../../domain/value-sets/database-values';
import type { CredentialRepository } from '../../contracts/credential.repository';
import { RepositoryError } from '../../contracts/repository-error';
import { MockDataService } from '../mock-data.service';
import { assertId } from './mock-crud.repository';

function safeCredential(row: Credential): Credential {
  return {
    id: row.id,
    tenantId: row.tenantId,
    provider: row.provider,
    state: 'configured',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class MockCredentialRepository implements CredentialRepository {
  private readonly data = inject(MockDataService);

  async list(tenantId: string): Promise<readonly Credential[]> {
    assertId(tenantId);
    const snapshot = this.data.snapshot();
    if (!snapshot.tenants.some((row) => row.id === tenantId))
      throw new RepositoryError('not-found', 'The tenant does not exist.');
    return snapshot.credentials.filter((row) => row.tenantId === tenantId).map(safeCredential);
  }

  async getForProvider(tenantId: string, provider: Provider): Promise<CredentialView> {
    if (!Object.values(PROVIDERS).includes(provider))
      throw new RepositoryError('validation', 'Unsupported provider.');
    const rows = await this.list(tenantId);
    const row = rows.find((entry) => entry.provider === provider);
    return (
      row ?? { id: null, tenantId, provider, state: 'missing', createdAt: null, updatedAt: null }
    );
  }
}
