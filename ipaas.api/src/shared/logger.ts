export interface Logger {
  info(bindings: Readonly<Record<string, unknown>>, message: string): void;
  error(bindings: Readonly<Record<string, unknown>>, message: string): void;
}
