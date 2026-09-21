import { logProvisioningStartup } from "../../src/bootstrap.js";
import assert from "node:assert/strict";
import { it } from "node:test";
import { ConfigurationRuntimeImageResolver } from "../../src/infrastructure/runtime-images/configuration-runtime-image-resolver.js";
import { loadRuntimeImageMappings } from "../../src/config/runtime-images.js";
import {
  loadConfig,
  loadDatabaseConfig,
} from "../../src/config/environment.js";
import {
  DependencyError,
  failureDiagnostics,
  RuntimeImageNotFoundError,
} from "../../src/application/errors/provisioning-errors.js";
import { Logger } from "../../src/infrastructure/logging/logger.js";
const mapping = {
  source: "connectwise",
  target: "keka",
  registry: "GHCR",
  repository: "test/runtime",
  tag: "v1",
};
const environment = {
  DATABASE_URL: "postgres://test.invalid/platform",
  ENCRYPTION_MASTER_KEY: Buffer.alloc(32, 1).toString("base64"),
  RUNTIME_IMAGE_MAPPINGS_JSON: JSON.stringify([mapping]),
};
it("resolves approved GHCR and DockerHub mappings and rejects unknown pairs", () => {
  const resolver = new ConfigurationRuntimeImageResolver(
    loadRuntimeImageMappings(environment.RUNTIME_IMAGE_MAPPINGS_JSON),
  );
  assert.equal(
    resolver.resolve("connectwise", "keka"),
    "ghcr.io/test/runtime:v1",
  );
  assert.throws(
    () => resolver.resolve("keka", "connectwise"),
    RuntimeImageNotFoundError,
  );
  const docker = new ConfigurationRuntimeImageResolver(
    loadRuntimeImageMappings(
      JSON.stringify([{ ...mapping, registry: "DockerHub" }]),
    ),
  );
  assert.equal(
    docker.resolve("connectwise", "keka"),
    "docker.io/test/runtime:v1",
  );
});
it("rejects workflow input that differs from the approved resolved image", () => {
  const resolver = new ConfigurationRuntimeImageResolver(
    loadRuntimeImageMappings(environment.RUNTIME_IMAGE_MAPPINGS_JSON),
    "ghcr.io/other/runtime:v2",
  );
  assert.throws(
    () => resolver.resolve("connectwise", "keka"),
    RuntimeImageNotFoundError,
  );
});
it("requires explicit valid configuration and does not expose malformed secrets", () => {
  assert.equal(loadConfig(environment).runtime.kind, "docker");
  assert.equal(
    loadDatabaseConfig({ DATABASE_URL: environment.DATABASE_URL }).databaseUrl,
    environment.DATABASE_URL,
  );
  for (const patch of [
    { DATABASE_URL: "secret-value" },
    { ENCRYPTION_MASTER_KEY: "secret-value" },
    { RUNTIME_IMAGE_MAPPINGS_JSON: "secret-value" },
    { LOG_LEVEL: "secret-value" },
    { RUNTIME_PROVIDER: "unknown" },
    { RUNTIME_PROVIDER: "github" },
  ])
    assert.throws(
      () => loadConfig({ ...environment, ...patch }),
      (error) =>
        error instanceof Error && !error.message.includes("secret-value"),
    );
});
it("rejects duplicate or malformed image mappings", () => {
  for (const value of [
    [],
    [mapping, mapping],
    [{ ...mapping, source: "unsupported" }],
    [{ ...mapping, tag: "--unsafe" }],
    [{ ...mapping, registry: "unknown" }],
  ]) {
    assert.throws(() => loadRuntimeImageMappings(JSON.stringify(value)));
  }
});
it("validates GitHub settings only for that provider and requires HTTPS", () => {
  const github = {
    ...environment,
    RUNTIME_PROVIDER: "github",
    GITHUB_ACTIONS_OWNER: "test",
    GITHUB_ACTIONS_REPOSITORY: "platform",
    GITHUB_ACTIONS_WORKFLOW: "provision-runtime.yml",
    GITHUB_ACTIONS_REF: "dev",
    GITHUB_TOKEN: "test-token",
  };
  assert.equal(loadConfig(github).runtime.kind, "github");
  assert.throws(() =>
    loadConfig({
      ...github,
      GITHUB_ACTIONS_API_BASE_URL: "http://example.test",
    }),
  );
});
it("logs structured correlation context without arbitrary secrets or exception objects", () => {
  const lines: string[] = [];
  const logger = new Logger("info", (line) => {
    lines.push(line);
  });
  logger.info("Handled request", {
    syncEntityId: "test-id",
    token: "do-not-log",
    databaseUrl: "do-not-log",
  });
  assert.ok(lines[0]?.includes("test-id"));
  assert.ok(!lines[0]?.includes("do-not-log"));
});

it("requires an explicit database name without disclosing the URL", () => {
  for (const databaseUrl of ["postgres://localhost", "postgres://localhost/"]) {
    assert.throws(
      () => loadDatabaseConfig({ DATABASE_URL: databaseUrl }),
      (error) => error instanceof Error && !error.message.includes(databaseUrl),
    );
  }
  for (const databaseUrl of [
    "postgres://localhost/ipaas_platform",
    "postgresql://user:password@localhost:5432/ipaas_platform",
  ]) {
    assert.equal(
      loadDatabaseConfig({ DATABASE_URL: databaseUrl }).databaseUrl,
      databaseUrl,
    );
  }
});
it("logs only safe dependency diagnostics and valid error status codes", () => {
  const lines: string[] = [];
  const logger = new Logger("info", (line) => lines.push(line));
  const diagnostics = failureDiagnostics(
    new DependencyError("runtime", true, {
      dependency: "github",
      operation: "workflow-dispatch",
      httpStatus: 503,
    }),
  );
  logger.error("Provisioning failed", {
    syncEntityId: "test-id",
    ...diagnostics,
    token: "secret",
    responseBody: "secret",
  });
  assert.deepEqual(JSON.parse(lines[0]!).context, {
    syncEntityId: "test-id",
    dependency: "github",
    operation: "workflow-dispatch",
    httpStatus: 503,
  });
  for (const httpStatus of [NaN, 0, 200, 600, 500.5]) {
    assert.equal(
      failureDiagnostics(
        new DependencyError("runtime", true, {
          dependency: "docker",
          operation: "start-container",
          httpStatus,
        }),
      ).httpStatus,
      undefined,
    );
  }
  assert.deepEqual(failureDiagnostics(new RuntimeImageNotFoundError()), {
    dependency: "runtime-image-resolver",
    operation: "resolve-image",
  });
});

it("startup exposes polling settings and drops all secret configuration", () => {
  const lines: string[] = [];
  const logger = new Logger("info", (line) => {
    lines.push(line);
  });
  const config = loadConfig({ ...environment, RUNTIME_PROVIDER: "docker" });
  logProvisioningStartup(logger, config);
  assert.deepEqual(JSON.parse(lines[0]!).context, {
    runtimeProvider: "docker",
    pollIntervalMs: 120000,
    batchSize: 10,
    maxConcurrency: 5,
  });
  assert.equal(JSON.parse(lines[0]!).message, "Provisioning Engine started");
  for (const secret of [
    config.databaseUrl,
    config.runtimeEnvironment.encryptionMasterKey,
  ])
    assert.ok(!lines.join("").includes(secret));
  logger.info("Runtime reconciliation completed", {
    runtimeName: "ipaas-sync-test",
    runtimeState: "exited",
    exitCode: 1,
    runtimeOutcome: "failed",
    previousStatus: "provisioning",
    nextStatus: "failed",
    token: "secret-sentinel",
    databaseUrl: "secret-sentinel",
    encryptionMasterKey: "secret-sentinel",
  });
  assert.equal(JSON.parse(lines[1]!).context.exitCode, 1);
  assert.equal(JSON.parse(lines[1]!).context.nextStatus, "failed");
  assert.ok(!lines.join("").includes("secret-sentinel"));
});
