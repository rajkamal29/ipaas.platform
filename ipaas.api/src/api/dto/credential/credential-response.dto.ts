import type { Provider } from "../../../domain/sync-request/sync-request";

export interface CredentialResponseDto {
  readonly id: string;
  readonly tenantId: string;
  readonly provider: Provider;
  readonly state: "configured";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MissingCredentialResponseDto {
  readonly id: null;
  readonly tenantId: string;
  readonly provider: Provider;
  readonly state: "missing";
  readonly createdAt: null;
  readonly updatedAt: null;
}

export type CredentialViewResponseDto =
  CredentialResponseDto | MissingCredentialResponseDto;
