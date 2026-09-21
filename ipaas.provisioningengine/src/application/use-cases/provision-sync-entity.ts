import type { SyncEntityRepository } from "../ports/repositories/sync-entity-repository.js";
import type { SyncRequestRepository } from "../ports/repositories/sync-request-repository.js";
import type { RuntimeImageResolver } from "../ports/runtime/runtime-image-resolver.js";
import type { RuntimeProvisioner } from "../ports/runtime/runtime-provisioner.js";
import type { Logger, LogContext } from "../ports/logger.js";
import type {
  ProvisioningResult,
  RuntimeRequest,
} from "../dto/provisioning.js";
import {
  ApplicationError,
  failureDiagnostics,
  DependencyError,
  ProvisioningFailedError,
  SyncEntityNotFoundError,
  SyncRequestNotFoundError,
  UnsupportedSyncTypeError,
} from "../errors/provisioning-errors.js";
import { uuid } from "../../domain/value-objects/uuid.js";
import {
  SYNC_ENTITY_STATUSES as STATUS,
  SYNC_TYPES as TYPE,
} from "../../domain/enums/platform-values.js";

export class ProvisionSyncEntityUseCase {
  constructor(
    private readonly entities: SyncEntityRepository,
    private readonly requests: SyncRequestRepository,
    private readonly images: RuntimeImageResolver,
    private readonly runtime: RuntimeProvisioner,
    private readonly logger: Logger,
  ) {}

  /** The caller must explicitly transition/claim the row before invoking this use case. */
  async execute(syncEntityId: string): Promise<ProvisioningResult> {
    const id = uuid(syncEntityId);
    this.logger.info("Provisioning requested", { syncEntityId: id });
    const entity = await this.entities.getById(id).catch((error: unknown) => {
      this.logger.error("Provisioning lookup failed", {
        syncEntityId: id,
        ...failureDiagnostics(error),
      });
      throw error;
    });
    if (!entity) throw new SyncEntityNotFoundError();
    if (entity.status === STATUS.active || entity.status === STATUS.completed)
      return {
        syncEntityId: id,
        status: entity.status,
        outcome: "already-provisioned",
      };
    if (entity.status !== STATUS.provisioning)
      throw new ApplicationError(
        "entity-not-provisioning",
        "An explicitly claimed provisioning row is required.",
      );
    let provisioningContext: LogContext = {
      syncEntityId: entity.id,
      syncRequestId: entity.syncRequestId,
      entity: entity.entity,
      syncType: entity.syncType,
    };
    let runtimeReturned = false;
    try {
      const parent = await this.requests.getById(entity.syncRequestId);
      if (!parent) throw new SyncRequestNotFoundError();
      provisioningContext = {
        ...provisioningContext,
        tenantId: parent.tenantId,
        source: parent.source,
        target: parent.target,
      };
      this.logger.info("Sync entity processing started", {
        ...provisioningContext,
        status: entity.status,
      });
      if (entity.syncType === TYPE.realTime)
        throw new UnsupportedSyncTypeError(entity.syncType);
      const imageReference = this.images.resolve(parent.source, parent.target);
      provisioningContext = { ...provisioningContext, imageReference };
      this.logger.info("Runtime image resolved", provisioningContext);
      let request: RuntimeRequest;
      if (entity.syncType === TYPE.interval) {
        if (
          entity.intervalSeconds === null ||
          !Number.isInteger(entity.intervalSeconds) ||
          entity.intervalSeconds < 60
        )
          throw new ApplicationError(
            "invalid-schedule",
            "Interval cadence must be an integer of at least 60 seconds.",
          );
        request = {
          syncEntityId: id,
          imageReference,
          syncType: TYPE.interval,
          intervalSeconds: entity.intervalSeconds,
        };
      } else {
        request = {
          syncEntityId: id,
          imageReference,
          syncType: TYPE.oneTime,
          intervalSeconds: null,
        };
      }
      const result = await this.runtime.provision(request);
      runtimeReturned = true;
      let nextStatus: "active" | "completed" | "failed" | undefined;
      let outcome: ProvisioningResult["outcome"] = result.kind;
      if (result.kind === "recurring-ready") {
        if (entity.syncType !== TYPE.interval)
          throw new DependencyError("runtime", true);
        nextStatus = STATUS.active;
      } else if (result.kind === "exited") {
        if (entity.syncType !== TYPE.oneTime)
          throw new DependencyError("runtime", true);
        nextStatus = result.exitCode === 0 ? STATUS.completed : STATUS.failed;
        outcome = nextStatus;
      }
      let statusRecorded = false;
      if (nextStatus) {
        statusRecorded = await this.entities.updateStatus(
          id,
          STATUS.provisioning,
          nextStatus,
        );
        this.logger.info("Provisioning status transition", {
          ...provisioningContext,
          previousStatus: STATUS.provisioning,
          nextStatus,
          statusRecorded,
        });
      }
      if (result.kind === "exited") {
        this.logger.info("Runtime reconciliation completed", {
          ...provisioningContext,
          runtimeName: result.runtimeName,
          runtimeState: result.runtimeState,
          exitCode: result.exitCode,
          runtimeOutcome: outcome,
          previousStatus: STATUS.provisioning,
          nextStatus: nextStatus!,
          statusRecorded,
          uncertain: false,
        });
      } else {
        this.logger.info(
          result.kind === "accepted"
            ? "Runtime provisioning workflow dispatched"
            : "Runtime provisioning observed",
          {
            ...provisioningContext,
            runtimeOutcome: result.kind,
            ...(result.kind === "started"
              ? { runtimeName: `ipaas-sync-${id}`, runtimeState: "running" }
              : {}),
          },
        );
      }
      // Re-read after the conditional update; never overwrite a concurrent terminal transition.
      const current = await this.entities.getById(id);
      if (!current) throw new SyncEntityNotFoundError();
      this.logger.info("Sync entity processing completed", {
        ...provisioningContext,
        outcome,
        status: current.status,
      });
      return {
        syncEntityId: id,
        status: current.status,
        outcome,
        runtimeReference: result.reference,
      };
    } catch (error: unknown) {
      // Ambiguous dispatch/network outcomes must be reconciled, not blindly retried.
      const uncertain =
        runtimeReturned ||
        !(error instanceof ApplicationError) ||
        (error instanceof DependencyError && error.uncertain);
      let statusRecorded = false;
      if (!uncertain) {
        try {
          statusRecorded = await this.entities.updateStatus(
            id,
            STATUS.provisioning,
            STATUS.failed,
          );
        } catch (persistenceError: unknown) {
          this.logger.error("Failure status persistence failed", {
            ...provisioningContext,
            ...failureDiagnostics(persistenceError),
          });
        }
      }
      const failureCode =
        error instanceof ApplicationError ? error.code : "unexpected-failure";
      if (uncertain)
        this.logger.info("Runtime reconciliation required", {
          ...provisioningContext,
          outcome: "reconciliation-required",
          uncertain: true,
          failureCode,
        });
      this.logger.error("Provisioning failed", {
        ...provisioningContext,
        failureCode,
        ...failureDiagnostics(error),
        statusRecorded,
        uncertain,
        previousStatus: STATUS.provisioning,
        ...(statusRecorded ? { nextStatus: STATUS.failed } : {}),
      });
      if (
        error instanceof ApplicationError &&
        !(error instanceof DependencyError) &&
        statusRecorded
      )
        throw error;
      throw new ProvisioningFailedError(failureCode, statusRecorded, uncertain);
    }
  }
}
