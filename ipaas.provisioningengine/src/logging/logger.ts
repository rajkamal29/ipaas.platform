export const logLevels = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof logLevels)[number];

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LogContext = Readonly<Record<string, unknown>>;

export class Logger {
  public constructor(private readonly minimumLevel: LogLevel) {}

  public debug(message: string, context?: LogContext): void {
    this.write("debug", message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.write("info", message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.write("warn", message, context);
  }

  public error(message: string, context?: LogContext): void {
    this.write("error", message, context);
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    if (levelPriority[level] < levelPriority[this.minimumLevel]) {
      return;
    }

    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context === undefined ? {} : { context }),
    });

    if (level === "error") {
      console.error(entry);
      return;
    }

    console.log(entry);
  }
}

