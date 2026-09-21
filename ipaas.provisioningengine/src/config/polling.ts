export const MAX_POLL_BATCH_SIZE = 100;
export interface PollingOptions {
  readonly intervalMs: number;
  readonly batchSize: number;
  readonly maxConcurrency: number;
}
export function loadPollingOptions(
  environment: NodeJS.ProcessEnv,
): PollingOptions {
  function integer(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const raw = environment[key];
    const value = raw === undefined ? fallback : Number(raw);
    if (
      (raw !== undefined && !/^\d+$/.test(raw)) ||
      !Number.isInteger(value) ||
      value < min ||
      value > max
    )
      throw new Error(
        key + " must be an integer between " + min + " and " + max + ".",
      );
    return value;
  }
  return {
    intervalMs: integer("PROVISIONING_POLL_INTERVAL_MS", 60000, 1000, 300000),
    batchSize: integer(
      "PROVISIONING_POLL_BATCH_SIZE",
      10,
      1,
      MAX_POLL_BATCH_SIZE,
    ),
    maxConcurrency: integer("PROVISIONING_MAX_CONCURRENCY", 5, 1, 100),
  };
}
