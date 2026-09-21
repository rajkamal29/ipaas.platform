import type {
  RuntimeRequest,
  RuntimeResult,
} from "../../../application/dto/provisioning.js";
import type { RuntimeProvisioner } from "../../../application/ports/runtime/runtime-provisioner.js";
import {
  DependencyError,
  RuntimeReconciliationRequiredError,
  type DependencyDiagnostics,
  UnsupportedSyncTypeError,
} from "../../../application/errors/provisioning-errors.js";
import type { RuntimeEnvironment } from "../../../config/environment.js";
import type { DockerClient, DockerInspection } from "./docker-client.js";
import { dockerStatus } from "./docker-client.js";

const identityLabel = "ipaas.sync-entity-id";
export class DockerContainerProvisioner implements RuntimeProvisioner {
  constructor(
    private readonly client: DockerClient,
    private readonly environment: RuntimeEnvironment,
    private readonly network: string,
  ) {}
  async provision(request: RuntimeRequest): Promise<RuntimeResult> {
    if (request.syncType === "interval")
      throw new UnsupportedSyncTypeError(request.syncType);
    const name = `ipaas-sync-${request.syncEntityId}`;
    const env = [
      `SYNC_ENTITY_ID=${request.syncEntityId}`,
      `DATABASE_URL=${this.environment.databaseUrl}`,
      `ENCRYPTION_MASTER_KEY=${this.environment.encryptionMasterKey}`,
    ];
    let mayHaveStarted = false;
    let createdByThisInvocation = false;
    let operation: DependencyDiagnostics["operation"] = "inspect-container";
    try {
      let container = this.client.getContainer(name);
      let inspection: DockerInspection | undefined;
      try {
        operation = "inspect-container";
        inspection = await container.inspect();
      } catch (error: unknown) {
        if (dockerStatus(error) !== 404) throw error;
      }
      if (!inspection) {
        operation = "ensure-image";
        await this.client.ensureImage(request.imageReference);
        try {
          operation = "create-container";
          container = await this.client.createContainer({
            Image: request.imageReference,
            name,
            Env: env,
            Labels: { [identityLabel]: request.syncEntityId },
            HostConfig: {
              NetworkMode: this.network,
              RestartPolicy: { Name: "no" },
              AutoRemove: false,
            },
          });
          createdByThisInvocation = true;
        } catch (error: unknown) {
          if (dockerStatus(error) !== 409) throw error;
          container = this.client.getContainer(name);
        }
        operation = "inspect-container";
        inspection = await container.inspect();
      }
      const actualEnvironment = inspection.Config.Env;
      if (
        inspection.Config.Labels?.[identityLabel] !== request.syncEntityId ||
        inspection.Config.Image !== request.imageReference ||
        inspection.HostConfig.NetworkMode !== this.network ||
        env.some((value) => !actualEnvironment?.includes(value))
      )
        throw new RuntimeReconciliationRequiredError();
      if (inspection.State.Status === "created") {
        if (!createdByThisInvocation)
          throw new RuntimeReconciliationRequiredError();
        // Only a start attempt makes this invocation capable of launching execution.
        mayHaveStarted = true;
        try {
          operation = "start-container";
          await container.start();
        } catch (error: unknown) {
          if (dockerStatus(error) !== 304) {
            // A rejected request plus a never-started snapshot is a definitive failure.
            // Server/network errors remain ambiguous even if a snapshot still says created.
            if (dockerStatus(error) === 400) {
              operation = "inspect-container";
              const rejected = await container.inspect();
              operation = "start-container";
              if (
                rejected.Id === inspection.Id &&
                rejected.State.Status === "created" &&
                rejected.State.StartedAt === "0001-01-01T00:00:00Z"
              )
                mayHaveStarted = false;
            }
            throw error;
          }
        }
        operation = "inspect-container";
        inspection = await container.inspect();
      }
      const previouslyStarted =
        typeof inspection.State.StartedAt === "string" &&
        Number.isFinite(Date.parse(inspection.State.StartedAt)) &&
        Date.parse(inspection.State.StartedAt) > 0;
      if (
        inspection.State.Status === "running" ||
        (inspection.State.Status === "exited" && previouslyStarted)
      ) {
        return {
          kind: "started",
          reference: inspection.Id,
          runtimeName: name,
          runtimeState: inspection.State.Status,
        };
      }
      throw new RuntimeReconciliationRequiredError();
    } catch (error: unknown) {
      if (error instanceof DependencyError) throw error;
      throw new DependencyError("runtime", mayHaveStarted, {
        dependency: "docker",
        operation,
        httpStatus: dockerStatus(error),
      });
    }
  }
}
