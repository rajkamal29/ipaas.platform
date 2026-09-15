export class RuntimeImageNotFoundError extends Error {
  public override readonly name = "RuntimeImageNotFoundError";

  public constructor(
    public readonly sourceConnector: string,
    public readonly destinationConnector: string,
  ) {
    super(
      `No runtime image is configured for source connector '${sourceConnector}' `
        + `and destination connector '${destinationConnector}'.`,
    );
  }
}

export class UnsupportedRuntimeImageRegistryError extends Error {
  public override readonly name = "UnsupportedRuntimeImageRegistryError";

  public constructor(public readonly registry: string) {
    super(
      `Runtime image registry '${registry}' is unsupported. Supported registries: DockerHub, GHCR.`,
    );
  }
}
