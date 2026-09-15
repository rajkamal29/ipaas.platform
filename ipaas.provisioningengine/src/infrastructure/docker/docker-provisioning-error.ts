export class ContainerProvisioningError extends Error {
  public override readonly name = "ContainerProvisioningError";

  public constructor(
    public readonly operation: "create/start" | "inspect" | "logs",
    public readonly containerReference: string,
    cause: unknown,
  ) {
    super(
      `Docker ${operation} failed for '${containerReference}': ${errorMessage(cause)}`,
      { cause },
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
