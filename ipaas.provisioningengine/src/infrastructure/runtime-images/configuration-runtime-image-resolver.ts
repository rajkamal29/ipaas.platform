import { RuntimeImageNotFoundError } from "../../application/errors/provisioning-errors.js";
import type { RuntimeImageResolver } from "../../application/ports/runtime/runtime-image-resolver.js";
import type { Provider } from "../../domain/enums/platform-values.js";
import type { RuntimeImageMapping } from "../../config/runtime-images.js";
export class ConfigurationRuntimeImageResolver implements RuntimeImageResolver {
  constructor(
    private readonly mappings: readonly RuntimeImageMapping[],
    private readonly expectedImage?: string,
  ) {}
  resolve(source: Provider, target: Provider): string {
    const mapping = this.mappings.find(
      (item) => item.source === source && item.target === target,
    );
    if (!mapping) throw new RuntimeImageNotFoundError();
    const host = mapping.registry === "GHCR" ? "ghcr.io" : "docker.io";
    const image = `${host}/${mapping.repository}:${mapping.tag}`;
    if (this.expectedImage && image !== this.expectedImage)
      throw new RuntimeImageNotFoundError();
    return image;
  }
}
