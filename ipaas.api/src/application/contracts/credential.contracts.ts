import type { Provider } from "../../domain/sync-request/sync-request";

export interface ConfigureCredentialsRequest {
  readonly body: unknown;
}

export interface ConfigureCredentialsInput {
  readonly source: Provider;
  readonly sourceSecret: string;
  readonly target: Provider;
  readonly targetSecret: string;
}

export interface CredentialOutput {
  readonly id: string;
  readonly tenantId: string;
  readonly provider: Provider;
  readonly state: "configured";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MissingCredentialOutput {
  readonly id: null;
  readonly tenantId: string;
  readonly provider: Provider;
  readonly state: "missing";
  readonly createdAt: null;
  readonly updatedAt: null;
}

export type CredentialViewOutput = CredentialOutput | MissingCredentialOutput;
