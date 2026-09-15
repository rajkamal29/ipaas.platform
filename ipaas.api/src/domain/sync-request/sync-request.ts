export const PROVIDERS = ["connectwise", "keka"] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface SyncRequest {
  readonly id: string;
  readonly tenantId: string;
  readonly source: Provider;
  readonly target: Provider;
  readonly createdAt: string;
}
