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
import { logLevels, type LogLevel } from "../logging/logger.js";

export interface AppConfig {
  logLevel: LogLevel;
  statusLogIntervalMs: number;
  databaseUrl: string | undefined;
  runtimeImageMappings: readonly RuntimeImageMapping[];
  docker: DockerConnectionOptions;
  githubActions: GitHubActionsOptions;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const logLevel = (environment.LOG_LEVEL ?? "info").toLowerCase();

  if (!isLogLevel(logLevel)) {
    throw new Error(
      `LOG_LEVEL must be one of: ${logLevels.join(", ")}. Received: ${logLevel}`,
    );
  }

  const statusLogIntervalMs = Number(environment.STATUS_LOG_INTERVAL_MS ?? "60000");

  if (!Number.isInteger(statusLogIntervalMs) || statusLogIntervalMs < 1) {
    throw new Error("STATUS_LOG_INTERVAL_MS must be a positive integer.");
  }

  return {
    logLevel,
    statusLogIntervalMs,
    databaseUrl: environment.DATABASE_URL,
    runtimeImageMappings: loadRuntimeImageMappings(
      environment.RUNTIME_IMAGE_MAPPINGS_JSON,
    ),
    docker: loadDockerConnectionOptions(environment),
    githubActions: loadGitHubActionsOptions(environment),
  };
}

function isLogLevel(value: string): value is LogLevel {
  return logLevels.some((level) => level === value);
}

