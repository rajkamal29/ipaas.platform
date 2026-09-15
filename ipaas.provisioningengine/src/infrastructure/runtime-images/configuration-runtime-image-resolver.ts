import {
  RuntimeImageNotFoundError,
  UnsupportedRuntimeImageRegistryError,
} from "../../application/errors/runtime-image-errors.js";
import type { RuntimeImageResolver } from "../../application/ports/runtime-image-resolver.js";
import type { RuntimeImageMapping } from "../../config/runtime-images.js";

const registryHosts = new Map<string, string>([
  ["dockerhub", "docker.io"],
  ["ghcr", "ghcr.io"],
]);

export class ConfigurationRuntimeImageResolver implements RuntimeImageResolver {
  public constructor(private readonly mappings: readonly RuntimeImageMapping[]) {}

  public resolve(sourceConnector: string, destinationConnector: string): string {
    const mapping = this.mappings.find(
      (candidate) => sameText(candidate.sourceConnector, sourceConnector)
        && sameText(candidate.destinationConnector, destinationConnector),
    );

    if (mapping === undefined) {
      throw new RuntimeImageNotFoundError(sourceConnector, destinationConnector);
    }

    const registryHost = registryHosts.get(mapping.registry.toLowerCase());
    if (registryHost === undefined) {
      throw new UnsupportedRuntimeImageRegistryError(mapping.registry);
    }

    return `${registryHost}/${mapping.repository}:${mapping.tag}`;
  }
}

function sameText(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}
