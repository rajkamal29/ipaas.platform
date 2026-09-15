import type { Provider } from "../../domain/sync-request/sync-request";

export interface SyncRequestWriteInput {
  readonly source: Provider;
  readonly target: Provider;
}

export interface SyncRequestWriteRequest {
  readonly body: unknown;
}

export interface SyncRequestListInput {
  readonly source?: unknown;
  readonly target?: unknown;
}

export interface SyncRequestListFilter {
  readonly source?: Provider;
  readonly target?: Provider;
}

export interface SyncRequestOutput {
  readonly id: string;
  readonly tenantId: string;
  readonly source: Provider;
  readonly target: Provider;
  readonly createdAt: string;
}
