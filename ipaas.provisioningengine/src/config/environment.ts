import {
  loadRuntimeImageMappings,
  type RuntimeImageMapping,
} from "./runtime-images.js";
import {
  loadDockerConnectionOptions,
  type DockerConnectionOptions,
} from "./docker.js";
import {
  loadGitHubActionsOptions,
  type GitHubActionsOptions,
} from "./github-actions.js";
import { uuid, type Uuid } from "../domain/value-objects/uuid.js";

export type LogLevel = "debug" | "info" | "warn" | "error";
export interface DatabaseConfig {
  readonly databaseUrl: string;
  readonly logLevel: LogLevel;
}
export interface RuntimeEnvironment {
  readonly databaseUrl: string;
  readonly encryptionMasterKey: string;
}
export interface AppConfig extends DatabaseConfig {
  readonly runtimeEnvironment: RuntimeEnvironment;
  readonly runtimeImageMappings: readonly RuntimeImageMapping[];
  readonly runtime:
    | { readonly kind: "docker"; readonly options: DockerConnectionOptions }
    | { readonly kind: "github"; readonly options: GitHubActionsOptions };
  readonly syncEntityId: Uuid | undefined;
  readonly allowLiveVerification: boolean;
  readonly expectedRuntimeImage: string | undefined;
}
export function loadDatabaseConfig(
  environment: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const databaseUrl = environment.DATABASE_URL;
  try {
    const parsed = new URL(databaseUrl ?? "");
    if (
      !["postgres:", "postgresql:"].includes(parsed.protocol) ||
      !parsed.hostname ||
      !parsed.pathname ||
      parsed.pathname === "/"
    )
      throw new Error();
  } catch {
    throw new Error(
      "DATABASE_URL must identify the shared PostgreSQL database.",
    );
  }
  const logLevel = environment.LOG_LEVEL ?? "info";
  if (!["debug", "info", "warn", "error"].includes(logLevel))
    throw new Error("Invalid LOG_LEVEL.");
  return { databaseUrl: databaseUrl!, logLevel: logLevel as LogLevel };
}
function parseConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const database = loadDatabaseConfig(environment);
  const key = environment.ENCRYPTION_MASTER_KEY ?? "";
  if (
    !/^[A-Za-z0-9+/]{43}=$/.test(key) ||
    Buffer.from(key, "base64").length !== 32
  )
    throw new Error(
      "ENCRYPTION_MASTER_KEY must be a base64-encoded 32-byte key.",
    );
  const runtimeDatabaseUrl =
    environment.RUNTIME_DATABASE_URL ?? database.databaseUrl;
  loadDatabaseConfig({ DATABASE_URL: runtimeDatabaseUrl });
  const kind = environment.RUNTIME_PROVIDER ?? "docker";
  if (kind !== "docker" && kind !== "github")
    throw new Error("RUNTIME_PROVIDER must be docker or github.");
  return {
    ...database,
    runtimeEnvironment: {
      databaseUrl: runtimeDatabaseUrl,
      encryptionMasterKey: key,
    },
    runtimeImageMappings: loadRuntimeImageMappings(
      environment.RUNTIME_IMAGE_MAPPINGS_JSON,
    ),
    runtime:
      kind === "docker"
        ? { kind, options: loadDockerConnectionOptions(environment) }
        : { kind, options: loadGitHubActionsOptions(environment) },
    syncEntityId: environment.SYNC_ENTITY_ID
      ? uuid(environment.SYNC_ENTITY_ID)
      : undefined,
    expectedRuntimeImage: environment.EXPECTED_RUNTIME_IMAGE,
    allowLiveVerification: environment.RUN_LIVE_VERIFICATION === "true",
  };
}

/** All validation messages in this module and its parsers omit supplied values. */
export class ConfigurationError extends Error {
  override readonly name = "ConfigurationError";
}
export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  try {
    return parseConfig(environment);
  } catch (error: unknown) {
    throw new ConfigurationError(
      error instanceof Error
        ? error.message
        : "Invalid provisioning configuration.",
    );
  }
}
