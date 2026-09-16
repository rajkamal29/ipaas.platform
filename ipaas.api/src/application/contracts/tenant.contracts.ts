export interface TenantWriteInput {
  readonly name: string;
}

export interface TenantWriteRequest {
  readonly body: unknown;
}

export interface TenantListInput {
  readonly name?: unknown;
}

export interface TenantListFilter {
  readonly name?: string;
}

export interface TenantOutput {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}
