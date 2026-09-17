import { RepositoryError } from '../../data-access/contracts/repository-error';
import type { ValidationIssue } from '../../domain/validation/model-validation';

export interface UiFeedback {
  readonly message: string;
  readonly retryable: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly requestId?: string;
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
      message: error.code === 'conflict' && conflictMessage ? conflictMessage : error.message,
      retryable: error.code === 'network' || error.code === 'server',
      issues: error.issues,
      ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
    };
  }
  return { message: fallback, retryable: true, issues: [] };
}
