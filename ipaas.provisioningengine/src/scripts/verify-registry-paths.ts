import { loadConfig } from "../config/environment.js";
import { ConfigurationRuntimeImageResolver } from "../infrastructure/runtime-images/configuration-runtime-image-resolver.js";
const config = loadConfig();
const resolver = new ConfigurationRuntimeImageResolver(
  config.runtimeImageMappings,
);
for (const mapping of config.runtimeImageMappings)
  console.log({
    source: mapping.source,
    target: mapping.target,
    imageReference: resolver.resolve(mapping.source, mapping.target),
  });
