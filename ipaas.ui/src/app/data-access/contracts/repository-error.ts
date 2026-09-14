import type { ValidationIssue } from '../../domain/validation/model-validation';

export type RepositoryErrorCode = 'validation' | 'conflict' | 'not-found';

export class RepositoryError extends Error {
  override readonly name = 'RepositoryError';

  constructor(
    readonly code: RepositoryErrorCode,
    message: string,
    readonly issues: readonly ValidationIssue[] = [],
    readonly constraint?: string,
  ) {
    super(message);
  }
}
