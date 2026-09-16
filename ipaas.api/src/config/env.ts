import { ValidationError } from "../application/errors/validation-error";

export type NodeEnvironment = "development" | "test" | "production";

export interface Environment {
  readonly port: number;
  readonly databaseUrl: string;
  readonly nodeEnv: NodeEnvironment;
}

export function loadEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  const details = [];
  const port = Number(source["PORT"] ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    details.push({
      field: "PORT",
      code: "range" as const,
      message: "PORT must be an integer from 1 to 65535.",
    });
  }
  const databaseUrl = source["DATABASE_URL"];
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
    details.push({
      field: "DATABASE_URL",
      code: "required" as const,
      message: "DATABASE_URL is required.",
    });
  }
  const nodeEnv = source["NODE_ENV"] ?? "development";
  if (!["development", "test", "production"].includes(nodeEnv)) {
    details.push({
      field: "NODE_ENV",
      code: "value" as const,
      message: "NODE_ENV must be development, test, or production.",
    });
  }
  if (details.length > 0)
    throw new ValidationError("Invalid environment configuration.", details);
  return {
    port,
    databaseUrl: String(databaseUrl),
    nodeEnv: nodeEnv as NodeEnvironment,
  };
}
