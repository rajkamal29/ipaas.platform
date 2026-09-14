import { RepositoryError } from '../../data-access/contracts/repository-error';
import type { ValidationIssue } from '../../domain/validation/model-validation';

export interface UiFeedback {
  readonly message: string;
  readonly retryable: boolean;
  readonly issues: readonly ValidationIssue[];
}

export class RouteContextError extends Error {
  override readonly name = 'RouteContextError';
}

export function uiFeedback(error: unknown, fallback: string, conflictMessage?: string): UiFeedback {
  if (error instanceof RouteContextError) {
    return { message: error.message, retryable: false, issues: [] };
  }
  if (error instanceof RepositoryError) {
    return {
      message:
        error.code === 'conflict'
          ? (conflictMessage ?? 'A record with these values already exists.')
          : error.code === 'not-found'
            ? 'This record is no longer available. Return to the previous page and try again.'
            : 'Check the submitted values and try again.',
      retryable: false,
      issues: error.issues,
    };
  }
  return { message: fallback, retryable: true, issues: [] };
}
