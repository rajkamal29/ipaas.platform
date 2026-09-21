export interface SyncEntityResponseDto {
  readonly id: string;
  readonly syncRequestId: string;
  readonly entity: "client" | "project" | "timesheet";
  readonly syncType: "real_time" | "interval" | "one_time";
  readonly status:
    "submitted" | "provisioning" | "active" | "completed" | "failed";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly intervalSeconds: number | null;
}

export interface SyncEntityReadResponseDto extends SyncEntityResponseDto {
  readonly lastRunStatus: "success" | "failed" | null;
  readonly syncStateUpdatedAt: string | null;
  readonly failedCount: number;
  readonly retryCount: number;
}
