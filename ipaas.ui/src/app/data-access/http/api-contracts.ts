import type { ValidationIssue } from '../../domain/validation/model-validation';

export interface ApiResponse<T> {
  readonly data: T;
  readonly timestamp: string;
}

export interface ApiErrorBody {
  readonly error?: {
    readonly code?: unknown;
    readonly message?: unknown;
    readonly details?: readonly ValidationIssue[];
    readonly requestId?: unknown;
  };
}
