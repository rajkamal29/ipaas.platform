export interface SyncRequestResponseDto {
  readonly id: string;
  readonly tenantId: string;
  readonly source: "connectwise" | "keka";
  readonly target: "connectwise" | "keka";
  readonly createdAt: string;
}
