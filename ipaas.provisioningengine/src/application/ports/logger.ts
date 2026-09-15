export type LogContext = Readonly<Record<string, string | number | boolean>>;
export interface Logger {
  info(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}
