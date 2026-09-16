import type {
  ConfigureCredentialsRequest,
  CredentialOutput,
  CredentialViewOutput,
} from "../contracts/credential.contracts";
import { NotFoundError } from "../errors/not-found-error";
import { ValidationError } from "../errors/validation-error";
import { toCredentialOutput } from "../mappers/credential-output.mapper";
import type { CredentialEncryptor } from "../ports/credential-encryptor";
import type {
  CredentialRepository,
  CredentialWrite,
} from "../ports/credential.repository";
import type { TenantRepository } from "../ports/tenant.repository";
import { validateConfigureCredentials } from "../validation/credential.validation";
import { requireEnum, requireUuid } from "../validation/validation";
import {
  PROVIDERS,
  type Provider,
} from "../../domain/sync-request/sync-request";

export class CredentialUseCase {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly credentials: CredentialRepository,
    private readonly encryptor: CredentialEncryptor,
  ) {}

  private async requireTenant(tenantId: string): Promise<string> {
    const id = requireUuid(tenantId, "tenantId");
    if ((await this.tenants.get(id)) === null) throw new NotFoundError();
    return id;
  }

  async list(tenantId: string): Promise<readonly CredentialOutput[]> {
    const id = await this.requireTenant(tenantId);
    return (await this.credentials.list(id)).map(toCredentialOutput);
  }

  async get(
    tenantId: string,
    provider: unknown,
  ): Promise<CredentialViewOutput> {
    const id = await this.requireTenant(tenantId);
    const parsedProvider = requireEnum(provider, "provider", PROVIDERS);
    const credential = await this.credentials.get(id, parsedProvider);
    return credential === null
      ? {
          id: null,
          tenantId: id,
          provider: parsedProvider,
          state: "missing",
          createdAt: null,
          updatedAt: null,
        }
      : toCredentialOutput(credential);
  }

  async configure(
    tenantId: string,
    request: ConfigureCredentialsRequest,
  ): Promise<readonly CredentialOutput[]> {
    const id = await this.requireTenant(tenantId);
    const input = validateConfigureCredentials(request.body);
    if (
      input.source === input.target &&
      input.sourceSecret !== input.targetSecret
    ) {
      throw new ValidationError(
        "Different secrets cannot be configured for the same provider.",
        [
          {
            field: "targetSecret",
            code: "value",
            message:
              "The two secrets must match when source and target use the same provider.",
          },
        ],
      );
    }
    const writes: CredentialWrite[] = [
      this.encrypt(input.source, input.sourceSecret),
    ];
    if (input.target !== input.source)
      writes.push(this.encrypt(input.target, input.targetSecret));
    return (await this.credentials.configure(id, writes)).map(
      toCredentialOutput,
    );
  }

  private encrypt(provider: Provider, secret: string): CredentialWrite {
    return { provider, encrypted: this.encryptor.encrypt(secret) };
  }
}
