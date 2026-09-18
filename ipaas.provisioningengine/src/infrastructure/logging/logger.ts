import type {
  Logger as LoggerPort,
  LogContext,
} from "../../application/ports/logger.js";
import type { LogLevel } from "../../config/environment.js";
const priority = { debug: 10, info: 20, warn: 30, error: 40 } as const;
/** Allowlisted structured context prevents accidental serialization of secrets/errors. */
const allowedContext = new Set([
  "syncEntityId",
  "outcome",
  "status",
  "failureCode",
  "dependency",
  "operation",
  "httpStatus",
  "statusRecorded",
  "uncertain",
  "signal",
  "tableCount",
  "claimedCount",
  "runtimeProvider",
  "pollIntervalMs",
  "batchSize",
  "maxConcurrency",
  "runtimeName",
  "runtimeState",
  "exitCode",
  "runtimeOutcome",
  "previousStatus",
  "nextStatus",
]);
export class Logger implements LoggerPort {
  constructor(
    private readonly level: LogLevel,
    private readonly output: (line: string) => void = (line) => {
      process.stdout.write(line + "\n");
    },
  ) {}
  info(message: string, context?: LogContext): void {
    this.write("info", message, context);
  }
  error(message: string, context?: LogContext): void {
    this.write("error", message, context);
  }
  private write(
    level: LogLevel,
    message: string,
    context: LogContext = {},
  ): void {
    if (priority[level] < priority[this.level]) return;
    const safe = Object.fromEntries(
      Object.entries(context).filter(([key]) => allowedContext.has(key)),
    );
    this.output(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        context: safe,
      }),
    );
  }
}
