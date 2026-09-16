import type { Provider } from "../sync-request/sync-request";

export interface Credential {
  readonly id: string;
  readonly tenantId: string;
  readonly provider: Provider;
  readonly createdAt: string;
  readonly updatedAt: string;
}
