import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RuntimeImageNotFoundError,
  UnsupportedRuntimeImageRegistryError,
} from "../../src/application/errors/runtime-image-errors.js";
import type { RuntimeImageMapping } from "../../src/config/runtime-images.js";
import { ConfigurationRuntimeImageResolver } from "../../src/infrastructure/runtime-images/configuration-runtime-image-resolver.js";

const mappings: readonly RuntimeImageMapping[] = [
  {
    sourceConnector: "connectwise",
    destinationConnector: "keka",
    registry: "GHCR",
    repository: "rajkamal29/ipaas-orchestration-engine",
    tag: "dev-latest",
  },
  // Explicit test-only mapping retained to cover Docker Hub URL construction.
  {
    sourceConnector: "dockerhub-test-source",
    destinationConnector: "dockerhub-test-target",
    registry: "DockerHub",
    repository: "library/hello-world",
    tag: "latest",
  },
];

describe("ConfigurationRuntimeImageResolver", () => {
  const resolver = new ConfigurationRuntimeImageResolver(mappings);

  it("resolves a GHCR mapping to a fully qualified image", () => {
    assert.equal(
      resolver.resolve("connectwise", "keka"),
      "ghcr.io/rajkamal29/ipaas-orchestration-engine:dev-latest",
    );
  });

  it("resolves an explicitly test-only Docker Hub mapping", () => {
    assert.equal(
      resolver.resolve("dockerhub-test-source", "dockerhub-test-target"),
      "docker.io/library/hello-world:latest",
    );
  });

  it("matches registry identifiers case-insensitively", () => {
    const lowerCaseRegistryResolver = new ConfigurationRuntimeImageResolver([
      { ...mappings[0]!, registry: "ghcr" },
    ]);

    assert.equal(
      lowerCaseRegistryResolver.resolve("connectwise", "keka"),
      "ghcr.io/rajkamal29/ipaas-orchestration-engine:dev-latest",
    );
  });

  it("matches connector names case-insensitively", () => {
    assert.equal(
      resolver.resolve("CONNECTWISE", "KeKa"),
      "ghcr.io/rajkamal29/ipaas-orchestration-engine:dev-latest",
    );
  });

  it("throws a domain-specific error for an unsupported pair", () => {
    assert.throws(
      () => resolver.resolve("connectwise", "unsupported"),
      (error: unknown) => {
        assert.ok(error instanceof RuntimeImageNotFoundError);
        assert.equal(error.sourceConnector, "connectwise");
        assert.equal(error.destinationConnector, "unsupported");
        assert.match(error.message, /No runtime image is configured/);
        return true;
      },
    );
  });

  it("throws a domain-specific error for an unsupported registry", () => {
    const unsupportedRegistryResolver = new ConfigurationRuntimeImageResolver([
      { ...mappings[0]!, registry: "UnsupportedRegistry" },
    ]);

    assert.throws(
      () => unsupportedRegistryResolver.resolve("connectwise", "keka"),
      (error: unknown) => {
        assert.ok(error instanceof UnsupportedRuntimeImageRegistryError);
        assert.equal(error.registry, "UnsupportedRegistry");
        assert.match(error.message, /Supported registries: DockerHub, GHCR/);
        return true;
      },
    );
  });
});

