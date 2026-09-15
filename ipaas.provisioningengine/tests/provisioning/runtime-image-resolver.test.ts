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
    sourceConnector: "workday",
    destinationConnector: "keka",
    registry: "GHCR",
    repository: "tezo/workday-keka-runtime",
    tag: "1.0.0",
  },
  {
    sourceConnector: "bamboohr",
    destinationConnector: "keka",
    registry: "DockerHub",
    repository: "tezo/bamboohr-keka-runtime",
    tag: "1.0.0",
  },
];

describe("ConfigurationRuntimeImageResolver", () => {
  const resolver = new ConfigurationRuntimeImageResolver(mappings);

  it("resolves a GHCR mapping to a fully qualified image", () => {
    assert.equal(
      resolver.resolve("workday", "keka"),
      "ghcr.io/tezo/workday-keka-runtime:1.0.0",
    );
  });

  it("resolves a Docker Hub mapping to a fully qualified image", () => {
    assert.equal(
      resolver.resolve("bamboohr", "keka"),
      "docker.io/tezo/bamboohr-keka-runtime:1.0.0",
    );
  });

  it("matches registry identifiers case-insensitively", () => {
    const lowerCaseRegistryResolver = new ConfigurationRuntimeImageResolver([
      { ...mappings[0]!, registry: "ghcr" },
    ]);

    assert.equal(
      lowerCaseRegistryResolver.resolve("workday", "keka"),
      "ghcr.io/tezo/workday-keka-runtime:1.0.0",
    );
  });

  it("matches connector names case-insensitively", () => {
    assert.equal(
      resolver.resolve("WORKDAY", "KeKa"),
      "ghcr.io/tezo/workday-keka-runtime:1.0.0",
    );
  });

  it("throws a domain-specific error for an unsupported pair", () => {
    assert.throws(
      () => resolver.resolve("workday", "unsupported"),
      (error: unknown) => {
        assert.ok(error instanceof RuntimeImageNotFoundError);
        assert.equal(error.sourceConnector, "workday");
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
      () => unsupportedRegistryResolver.resolve("workday", "keka"),
      (error: unknown) => {
        assert.ok(error instanceof UnsupportedRuntimeImageRegistryError);
        assert.equal(error.registry, "UnsupportedRegistry");
        assert.match(error.message, /Supported registries: DockerHub, GHCR/);
        return true;
      },
    );
  });
});

