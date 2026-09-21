import type { ValidationIssue } from '../../domain/validation/model-validation';

export type RepositoryErrorCode = 'validation' | 'conflict' | 'not-found' | 'network' | 'server';

export class RepositoryError extends Error {
  override readonly name = 'RepositoryError';

  constructor(
    readonly code: RepositoryErrorCode,
    message: string,
    readonly issues: readonly ValidationIssue[] = [],
    readonly constraint?: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}
