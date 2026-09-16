import { createDecipheriv, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { MappingProfileKey } from "../../src/application/contracts/mapping-profile.contracts";
import type {
  CredentialRepository,
  CredentialWrite,
} from "../../src/application/ports/credential.repository";
import type { GlobalMappingProfileRepository } from "../../src/application/ports/global-mapping-profile.repository";
import type { MappingProfileRepository } from "../../src/application/ports/mapping-profile.repository";
import type { TenantRepository } from "../../src/application/ports/tenant.repository";
import { CredentialUseCase } from "../../src/application/use-cases/credential.use-case";
import { MappingProfileUseCase } from "../../src/application/use-cases/mapping-profile.use-case";
import { validateCreateMappingProfile } from "../../src/application/validation/mapping-profile.validation";
import type { Credential } from "../../src/domain/credential/credential";
import type {
  GlobalMappingProfile,
  MappingProfile,
} from "../../src/domain/mapping-profile/mapping-profile";
import { AesGcmCredentialEncryptor } from "../../src/infrastructure/security/aes-gcm-credential-encryptor";

const tenantId = "00000000-0000-4000-8000-000000000001";
const now = "2026-09-16T00:00:00.000Z";

const tenants: TenantRepository = {
  list: async () => [],
  get: async (id) =>
    id === tenantId ? { id, name: "Tenant", createdAt: now } : null,
  create: async () => ({ id: tenantId, name: "Tenant", createdAt: now }),
  update: async () => null,
};

class Credentials implements CredentialRepository {
  writes: readonly CredentialWrite[] = [];
  async list(): Promise<readonly Credential[]> {
    return [];
  }
  async get(): Promise<Credential | null> {
    return null;
  }
  async configure(
    id: string,
    writes: readonly CredentialWrite[],
  ): Promise<readonly Credential[]> {
    this.writes = writes;
    return writes.map((write, index) => ({
      id: `00000000-0000-4000-8000-00000000001${String(index)}`,
      tenantId: id,
      provider: write.provider,
      createdAt: now,
      updatedAt: now,
    }));
  }
}

describe("Issue #12 application behavior", () => {
  it("encrypts two providers independently and returns only safe metadata", async () => {
    const repository = new Credentials();
    const encrypt = vi.fn((secret: string) => ({
      encryptedPayload: Buffer.from(secret),
      iv: Buffer.alloc(12),
      authTag: Buffer.alloc(16),
    }));
    const useCase = new CredentialUseCase(tenants, repository, { encrypt });
    const output = await useCase.configure(tenantId, {
      body: {
        source: "connectwise",
        sourceSecret: "first",
        target: "keka",
        targetSecret: "second",
      },
    });
    expect(encrypt).toHaveBeenCalledTimes(2);
    expect(repository.writes.map((row) => row.provider)).toEqual([
      "connectwise",
      "keka",
    ]);
    expect(JSON.stringify(output)).not.toMatch(
      /first|second|encrypted|authTag|\biv\b/,
    );
  });

  it("writes one row for equal same-provider secrets and rejects differing secrets before encryption", async () => {
    const repository = new Credentials();
    const encrypt = vi.fn(() => ({
      encryptedPayload: Buffer.alloc(1),
      iv: Buffer.alloc(12),
      authTag: Buffer.alloc(16),
    }));
    const useCase = new CredentialUseCase(tenants, repository, { encrypt });
    await useCase.configure(tenantId, {
      body: {
        source: "connectwise",
        sourceSecret: "same",
        target: "connectwise",
        targetSecret: "same",
      },
    });
    expect(repository.writes).toHaveLength(1);
    await expect(
      useCase.configure(tenantId, {
        body: {
          source: "connectwise",
          sourceSecret: "left",
          target: "connectwise",
          targetSecret: "right",
        },
      }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(encrypt).toHaveBeenCalledTimes(1);
  });

  it("uses the orchestration-compatible AES-256-GCM JSON format with fresh IVs", () => {
    const key = randomBytes(32);
    const encryptor = new AesGcmCredentialEncryptor(key.toString("base64"));
    const first = encryptor.encrypt("credential-value");
    const second = encryptor.encrypt("credential-value");
    expect(Buffer.from(first.iv)).not.toEqual(Buffer.from(second.iv));
    const decipher = createDecipheriv("aes-256-gcm", key, first.iv);
    decipher.setAuthTag(first.authTag);
    const plaintext = Buffer.concat([
      decipher.update(first.encryptedPayload),
      decipher.final(),
    ]).toString("utf8");
    expect(JSON.parse(plaintext)).toBe("credential-value");
  });

  it("preserves generic JSON mapping values and all PostgreSQL integer versions", () => {
    expect(
      validateCreateMappingProfile({
        provider: "connectwise",
        entity: "client",
        direction: "inbound",
        version: -1,
        fieldMappings: null,
      }),
    ).toMatchObject({ version: -1, fieldMappings: null });
    expect(() =>
      validateCreateMappingProfile({
        provider: "connectwise",
        entity: "client",
        direction: "inbound",
        version: 2_147_483_648,
        fieldMappings: [],
      }),
    ).toThrow(expect.objectContaining({ code: "validation" }));
  });
});

describe("effective mapping resolution", () => {
  const key: MappingProfileKey = {
    provider: "connectwise",
    entity: "client",
    direction: "inbound",
  };
  const global: GlobalMappingProfile = {
    id: "00000000-0000-4000-8000-000000000101",
    ...key,
    version: 1,
    fieldMappings: [],
    isActive: true,
    createdAt: now,
  };
  const tenant: MappingProfile = {
    ...global,
    id: "00000000-0000-4000-8000-000000000102",
    tenantId,
  };

  function useCase(
    tenantResult: MappingProfile | null,
    globalResult: GlobalMappingProfile | null,
  ) {
    const mappings: MappingProfileRepository = {
      list: async () => [],
      get: async () => null,
      create: async () => tenant,
      update: async () => tenant,
      activate: async () => tenant,
      findActive: async () => tenantResult,
    };
    const globals: GlobalMappingProfileRepository = {
      list: async () => [],
      get: async () => null,
      create: async () => global,
      update: async () => global,
      activate: async () => global,
      findActive: async () => globalResult,
    };
    return new MappingProfileUseCase(tenants, mappings, globals);
  }

  it.each([
    [tenant, global, "tenant"],
    [null, global, "global"],
    [null, null, "missing"],
  ] as const)(
    "resolves tenant, global, and missing precedence",
    async (tenantRow, globalRow, origin) => {
      await expect(
        useCase(tenantRow, globalRow).resolveEffective(tenantId, key),
      ).resolves.toMatchObject({ origin });
    },
  );
});
