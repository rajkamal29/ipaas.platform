import { PROVIDERS, type Provider } from "../domain/enums/platform-values.js";
export interface RuntimeImageMapping {
  readonly source: Provider;
  readonly target: Provider;
  readonly registry: "DockerHub" | "GHCR";
  readonly repository: string;
  readonly tag: string;
}
export function loadRuntimeImageMappings(
  serialized: string | undefined,
): readonly RuntimeImageMapping[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized ?? "");
  } catch {
    throw new Error(
      "RUNTIME_IMAGE_MAPPINGS_JSON must contain a valid image catalogue.",
    );
  }
  if (!Array.isArray(parsed) || parsed.length === 0)
    throw new Error("At least one approved runtime image mapping is required.");
  const seen = new Set<string>();
  return parsed.map((entry: unknown) => {
    if (entry === null || typeof entry !== "object")
      throw new Error("Invalid runtime image mapping.");
    const value = entry as Record<string, unknown>;
    if (
      !PROVIDERS.includes(value.source as Provider) ||
      !PROVIDERS.includes(value.target as Provider) ||
      (value.registry !== "DockerHub" && value.registry !== "GHCR") ||
      typeof value.repository !== "string" ||
      !/^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)+$/.test(
        value.repository,
      ) ||
      typeof value.tag !== "string" ||
      !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(value.tag)
    )
      throw new Error("Invalid runtime image mapping fields.");
    const key = `${value.source}:${value.target}`;
    if (seen.has(key))
      throw new Error("Duplicate runtime image provider pair.");
    seen.add(key);
    return {
      source: value.source as Provider,
      target: value.target as Provider,
      registry: value.registry,
      repository: value.repository,
      tag: value.tag,
    };
  });
}
