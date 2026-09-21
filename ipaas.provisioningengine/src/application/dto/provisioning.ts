import type { SyncEntityStatus } from "../../domain/enums/platform-values.js";
import type { Uuid } from "../../domain/value-objects/uuid.js";
export type RuntimeRequest = {
  readonly syncEntityId: Uuid;
  readonly imageReference: string;
} & (
  | { readonly syncType: "one_time"; readonly intervalSeconds: null }
  | { readonly syncType: "interval"; readonly intervalSeconds: number }
);
export type RuntimeResult =
  | { readonly kind: "accepted"; readonly reference: string }
  | {
      readonly kind: "started";
      readonly reference: string;
      readonly runtimeName?: string;
      readonly runtimeState?: "running" | "exited";
    }
  | { readonly kind: "recurring-ready"; readonly reference: string };
export interface ProvisioningResult {
  readonly syncEntityId: Uuid;
  readonly status: SyncEntityStatus;
  readonly outcome:
    "already-provisioned" | "completed" | "failed" | RuntimeResult["kind"];
  readonly runtimeReference?: string;
}
