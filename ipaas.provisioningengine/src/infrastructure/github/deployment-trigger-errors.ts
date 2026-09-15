export class DeploymentTriggerConfigurationError extends Error {
  public override readonly name = "DeploymentTriggerConfigurationError";

  public constructor(public readonly missingSettings: readonly string[]) {
    super(`Missing required GitHub Actions configuration: ${missingSettings.join(", ")}.`);
  }
}

export class DeploymentTriggerError extends Error {
  public override readonly name = "DeploymentTriggerError";

  public constructor(
    public readonly statusCode: number | undefined,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
  }
}
