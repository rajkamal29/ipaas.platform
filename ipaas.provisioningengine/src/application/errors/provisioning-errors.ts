import type { SyncType } from "../../domain/enums/platform-values.js";
export class ApplicationError extends Error {
  override readonly name: string = "ApplicationError";
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export class SyncEntityNotFoundError extends ApplicationError {
  constructor() {
    super("sync-entity-not-found", "Sync entity was not found.");
  }
}
export class SyncRequestNotFoundError extends ApplicationError {
  constructor() {
    super("sync-request-not-found", "Parent sync request was not found.");
  }
}
export class UnsupportedSyncTypeError extends ApplicationError {
  constructor(readonly syncType: SyncType) {
    super(
      "unsupported-sync-type",
      "This sync type is not supported by the selected runtime.",
    );
  }
}
export class RuntimeImageNotFoundError extends ApplicationError {
  constructor() {
    super(
      "runtime-image-not-found",
      "No approved runtime image is configured for this provider pair.",
    );
  }
}
export interface DependencyDiagnostics {
  readonly dependency:
    "postgres" | "docker" | "github" | "runtime-image-resolver";
  readonly operation:
    | "claim-submitted"
    | "load-sync-entity"
    | "load-sync-request"
    | "update-status"
    | "inspect-container"
    | "ensure-image"
    | "create-container"
    | "start-container"
    | "reconcile-container"
    | "workflow-dispatch"
    | "resolve-image";
  readonly httpStatus?: number;
}

export function failureDiagnostics(
  error: unknown,
): Record<string, string | number> {
  const diagnostics =
    error instanceof DependencyError
      ? error.diagnostics
      : error instanceof RuntimeImageNotFoundError
        ? { dependency: "runtime-image-resolver", operation: "resolve-image" }
        : undefined;
  if (!diagnostics) return {};
  const context: Record<string, string | number> = {
    dependency: diagnostics.dependency,
    operation: diagnostics.operation,
  };
  if (
    "httpStatus" in diagnostics &&
    typeof diagnostics.httpStatus === "number" &&
    Number.isInteger(diagnostics.httpStatus) &&
    diagnostics.httpStatus >= 400 &&
    diagnostics.httpStatus <= 599
  )
    context.httpStatus = diagnostics.httpStatus;
  return context;
}

/** Infrastructure adapters expose safe errors, never raw driver responses or secrets. */
export class DependencyError extends ApplicationError {
  constructor(
    readonly dependency: "database" | "runtime",
    readonly uncertain: boolean = false,
    readonly diagnostics?: DependencyDiagnostics,
  ) {
    super(
      "dependency-failed",
      `${dependency} operation failed${uncertain ? "; outcome requires reconciliation" : ""}.`,
    );
  }
}
export class RuntimeReconciliationRequiredError extends DependencyError {
  override readonly name = "RuntimeReconciliationRequiredError";
  constructor() {
    super("runtime", true, {
      dependency: "docker",
      operation: "reconcile-container",
    });
  }
}
export class ProvisioningFailedError extends ApplicationError {
  constructor(
    readonly failureCode: string,
    readonly statusRecorded: boolean,
    readonly uncertain: boolean = false,
  ) {
    super(
      "provisioning-failed",
      "Provisioning failed. Check the entity lifecycle and correlated logs before retrying.",
    );
  }
}
