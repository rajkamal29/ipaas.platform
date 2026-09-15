export interface RuntimeImageMapping {
  sourceConnector: string;
  destinationConnector: string;
  registry: string;
  repository: string;
  tag: string;
}

const defaultRuntimeImageMappings: readonly RuntimeImageMapping[] = [
  {
    sourceConnector: "connectwise",
    destinationConnector: "keka",
    registry: "GHCR",
    repository: "rajkamal29/ipaas-orchestration-engine",
    tag: "dev-latest",
  },
];

export function loadRuntimeImageMappings(
  serializedMappings: string | undefined,
): readonly RuntimeImageMapping[] {
  if (serializedMappings === undefined || serializedMappings.trim() === "") {
    return defaultRuntimeImageMappings;
  }

  let parsedMappings: unknown;

  try {
    parsedMappings = JSON.parse(serializedMappings);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`RUNTIME_IMAGE_MAPPINGS_JSON must be valid JSON: ${reason}`);
  }

  if (!Array.isArray(parsedMappings) || !parsedMappings.every(isRuntimeImageMapping)) {
    throw new Error(
      "RUNTIME_IMAGE_MAPPINGS_JSON must be an array whose entries define "
        + "sourceConnector, destinationConnector, registry, repository, and tag.",
    );
  }

  return parsedMappings;
}

function isRuntimeImageMapping(value: unknown): value is RuntimeImageMapping {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const mapping = value as Record<string, unknown>;

  return isNonBlankString(mapping.sourceConnector)
    && isNonBlankString(mapping.destinationConnector)
    && isNonBlankString(mapping.registry)
    && isNonBlankString(mapping.repository)
    && isNonBlankString(mapping.tag);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

