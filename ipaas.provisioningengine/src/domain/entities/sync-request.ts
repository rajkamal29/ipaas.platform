import type { Provider } from "../enums/platform-values.js";
import type { Uuid } from "../value-objects/uuid.js";
export interface SyncRequest {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly source: Provider;
  readonly target: Provider;
  readonly createdAt: string;
}
