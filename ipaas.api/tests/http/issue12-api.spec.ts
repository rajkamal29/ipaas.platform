import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import type { CanonicalEntityListFilter } from "../../src/application/contracts/canonical-entity.contracts";
import type {
  CreateMappingProfileInput,
  MappingProfileFilter,
  MappingProfileKey,
  MappingProfileWriteInput,
} from "../../src/application/contracts/mapping-profile.contracts";
import type {
  CredentialRepository,
  CredentialWrite,
} from "../../src/application/ports/credential.repository";
import type { GlobalMappingProfileRepository } from "../../src/application/ports/global-mapping-profile.repository";
import type { MappingProfileRepository } from "../../src/application/ports/mapping-profile.repository";
import type {
  TenantListFilter,
  TenantWriteInput,
} from "../../src/application/contracts/tenant.contracts";
import { CanonicalEntityUseCase } from "../../src/application/use-cases/canonical-entity.use-case";
import { CredentialUseCase } from "../../src/application/use-cases/credential.use-case";
import { GlobalMappingProfileUseCase } from "../../src/application/use-cases/global-mapping-profile.use-case";
import { MappingProfileUseCase } from "../../src/application/use-cases/mapping-profile.use-case";
import { SyncEntityUseCase } from "../../src/application/use-cases/sync-entity.use-case";
import { SyncRequestUseCase } from "../../src/application/use-cases/sync-request.use-case";
import { TenantUseCase } from "../../src/application/use-cases/tenant.use-case";
import type { CanonicalEntity } from "../../src/domain/canonical-entity/canonical-entity";
import type { Credential } from "../../src/domain/credential/credential";
import type {
  GlobalMappingProfile,
  MappingProfile,
} from "../../src/domain/mapping-profile/mapping-profile";
import type { Tenant } from "../../src/domain/tenant/tenant";

const tenantA = "00000000-0000-4000-8000-000000000001";
const tenantB = "00000000-0000-4000-8000-000000000002";
const now = "2026-09-16T00:00:00.000Z";

class Tenants {
  rows: Tenant[] = [
    { id: tenantA, name: "A", createdAt: now },
    { id: tenantB, name: "B", createdAt: now },
  ];
  async list(filter: TenantListFilter) {
    return this.rows.filter(
      (r) => filter.name === undefined || r.name === filter.name,
    );
  }
  async get(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async create(input: TenantWriteInput) {
    const row = { id: crypto.randomUUID(), ...input, createdAt: now };
    this.rows.push(row);
    return row;
  }
  async update(id: string, input: TenantWriteInput) {
    const row = this.rows.find((r) => r.id === id);
    return row ? { ...row, ...input } : null;
  }
}

class Credentials implements CredentialRepository {
  rows: Credential[] = [];
  async list(id: string) {
    return this.rows.filter((r) => r.tenantId === id);
  }
  async get(id: string, provider: Credential["provider"]) {
    return (
      this.rows.find((r) => r.tenantId === id && r.provider === provider) ??
      null
    );
  }
  async configure(id: string, writes: readonly CredentialWrite[]) {
    return writes.map((write) => {
      const existing = this.rows.find(
        (r) => r.tenantId === id && r.provider === write.provider,
      );
      const row: Credential =
        existing === undefined
          ? {
              id: crypto.randomUUID(),
              tenantId: id,
              provider: write.provider,
              createdAt: now,
              updatedAt: now,
            }
          : { ...existing, updatedAt: now };
      if (existing === undefined) this.rows.push(row);
      return row;
    });
  }
}

const canonicalRow: CanonicalEntity = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "client",
  version: 1,
  schema: { type: "object", required: ["id", "name"] },
  createdAt: now,
};

class Globals implements GlobalMappingProfileRepository {
  rows: GlobalMappingProfile[] = [];
  async list(filter: MappingProfileFilter) {
    return this.rows.filter((r) =>
      Object.entries(filter).every(
        ([k, v]) => r[k as keyof GlobalMappingProfile] === v,
      ),
    );
  }
  async get(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async create(input: CreateMappingProfileInput) {
    const row: GlobalMappingProfile = {
      id: crypto.randomUUID(),
      ...input,
      isActive: input.isActive ?? true,
      createdAt: now,
    };
    this.rows.push(row);
    return row;
  }
  async update(id: string, input: MappingProfileWriteInput) {
    const index = this.rows.findIndex((r) => r.id === id);
    if (index < 0) return null;
    const row = { ...this.rows[index]!, ...input };
    this.rows[index] = row;
    return row;
  }
  async activate(id: string) {
    const selected = this.rows.find((r) => r.id === id);
    if (!selected) return null;
    this.rows = this.rows.map((r) =>
      r.provider === selected.provider &&
      r.entity === selected.entity &&
      r.direction === selected.direction
        ? { ...r, isActive: r.id === id }
        : r,
    );
    return this.get(id);
  }
  async findActive(key: MappingProfileKey) {
    return (
      this.rows.find(
        (r) =>
          r.isActive &&
          r.provider === key.provider &&
          r.entity === key.entity &&
          r.direction === key.direction,
      ) ?? null
    );
  }
}

class Mappings implements MappingProfileRepository {
  rows: MappingProfile[] = [];
  async list(id: string, filter: MappingProfileFilter) {
    return this.rows.filter(
      (r) =>
        r.tenantId === id &&
        Object.entries(filter).every(
          ([k, v]) => r[k as keyof MappingProfile] === v,
        ),
    );
  }
  async get(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async create(id: string, input: CreateMappingProfileInput) {
    const row: MappingProfile = {
      id: crypto.randomUUID(),
      tenantId: id,
      ...input,
      isActive: input.isActive ?? true,
      createdAt: now,
    };
    this.rows.push(row);
    return row;
  }
  async update(id: string, input: MappingProfileWriteInput) {
    const index = this.rows.findIndex((r) => r.id === id);
    if (index < 0) return null;
    const row = { ...this.rows[index]!, ...input };
    this.rows[index] = row;
    return row;
  }
  async activate(owner: string, id: string) {
    const selected = this.rows.find((r) => r.id === id && r.tenantId === owner);
    if (!selected) return null;
    this.rows = this.rows.map((r) =>
      r.tenantId === owner &&
      r.provider === selected.provider &&
      r.entity === selected.entity &&
      r.direction === selected.direction
        ? { ...r, isActive: r.id === id }
        : r,
    );
    return this.get(id);
  }
  async findActive(owner: string, key: MappingProfileKey) {
    return (
      this.rows.find(
        (r) =>
          r.tenantId === owner &&
          r.isActive &&
          r.provider === key.provider &&
          r.entity === key.entity &&
          r.direction === key.direction,
      ) ?? null
    );
  }
}

function issue12App() {
  const tenants = new Tenants();
  const credentials = new Credentials();
  const globals = new Globals();
  const mappings = new Mappings();
  const emptyRequests = {
    list: async () => [],
    get: async () => null,
    create: async () => {
      throw new Error();
    },
    update: async () => null,
  };
  const emptyEntities = {
    list: async () => [],
    get: async () => null,
    create: async () => {
      throw new Error();
    },
    update: async () => null,
  };
  return {
    app: createApp({
      tenants: new TenantUseCase(tenants),
      syncRequests: new SyncRequestUseCase(tenants, emptyRequests),
      syncEntities: new SyncEntityUseCase(
        tenants,
        emptyRequests,
        emptyEntities,
      ),
      credentials: new CredentialUseCase(tenants, credentials, {
        encrypt: () => ({
          encryptedPayload: Buffer.alloc(2),
          iv: Buffer.alloc(12),
          authTag: Buffer.alloc(16),
        }),
      }),
      canonicalEntities: new CanonicalEntityUseCase({
        list: async (filter: CanonicalEntityListFilter) =>
          filter.name === undefined || filter.name === canonicalRow.name
            ? [canonicalRow]
            : [],
        get: async (id: string) =>
          id === canonicalRow.id ? canonicalRow : null,
      }),
      globalMappings: new GlobalMappingProfileUseCase(globals),
      mappings: new MappingProfileUseCase(tenants, mappings, globals),
      checkReadiness: async () => undefined,
      logger: { info: () => undefined, error: () => undefined },
    }),
    globals,
    mappings,
  };
}

const mappingBody = {
  provider: "connectwise",
  entity: "client",
  direction: "inbound",
  version: 1,
  fieldMappings: [{ canonicalField: "id", sourceField: "id" }],
} as const;

describe("Issue #12 HTTP contract", () => {
  let context: ReturnType<typeof issue12App>;
  beforeEach(() => {
    context = issue12App();
  });

  it("configures and reads safe credential metadata without secret or crypto leakage", async () => {
    const created = await request(context.app)
      .post(`/api/tenants/${tenantA}/credentials`)
      .send({
        source: "connectwise",
        sourceSecret: "sensitive-one",
        target: "keka",
        targetSecret: "sensitive-two",
      })
      .expect(201);
    expect(created.body.data).toHaveLength(2);
    expect(created.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(created.body)).not.toMatch(
      /sensitive|secret|encrypted|auth.?tag|\biv\b/i,
    );
    const list = await request(context.app)
      .get(`/api/tenants/${tenantA}/credentials`)
      .expect(200);
    expect(list.body.data).toHaveLength(2);
    await request(context.app)
      .get(`/api/tenants/${tenantB}/credentials/keka`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.data).toMatchObject({ state: "missing", id: null }),
      );
  });

  it("supports equal same-provider credentials and safely rejects differing secrets", async () => {
    await request(context.app)
      .post(`/api/tenants/${tenantA}/credentials`)
      .send({
        source: "connectwise",
        sourceSecret: "same",
        target: "connectwise",
        targetSecret: "same",
      })
      .expect(201)
      .expect(({ body }) => expect(body.data).toHaveLength(1));
    const rejected = await request(context.app)
      .post(`/api/tenants/${tenantA}/credentials`)
      .send({
        source: "connectwise",
        sourceSecret: "left-value",
        target: "connectwise",
        targetSecret: "right-value",
      })
      .expect(422);
    expect(JSON.stringify(rejected.body)).not.toMatch(/left-value|right-value/);
  });

  it("strictly validates credential bodies and providers", async () => {
    await request(context.app)
      .post(`/api/tenants/${tenantA}/credentials`)
      .send({ source: "other" })
      .expect(422);
    await request(context.app)
      .post(`/api/tenants/${tenantA}/credentials`)
      .send([])
      .expect(422);
    await request(context.app)
      .post(`/api/tenants/${tenantA}/credentials`)
      .send({ ...mappingBody, extra: true })
      .expect(422);
    await request(context.app)
      .get(`/api/tenants/${tenantA}/credentials/other`)
      .expect(422);
    await request(context.app)
      .get("/api/tenants/not-a-uuid/credentials")
      .expect(422);
  });

  it("exposes canonical reads and no canonical mutation routes", async () => {
    const list = await request(context.app)
      .get("/api/canonical-entities?name=client&version=1")
      .expect(200);
    expect(list.body.data[0]).toMatchObject({ schema: { type: "object" } });
    await request(context.app)
      .get(`/api/canonical-entities/${canonicalRow.id}`)
      .expect(200);
    await request(context.app)
      .get("/api/canonical-entities?version=2147483648")
      .expect(422);
    await request(context.app)
      .post("/api/canonical-entities")
      .send({})
      .expect(404);
  });

  it("implements global mapping create, filters, full update, and activation without DELETE", async () => {
    const first = await request(context.app)
      .post("/api/global-mapping-profiles")
      .send(mappingBody)
      .expect(201);
    const second = await request(context.app)
      .post("/api/global-mapping-profiles")
      .send({
        ...mappingBody,
        version: 2,
        fieldMappings: null,
        isActive: false,
      })
      .expect(201);
    const firstId = first.body.data.id as string;
    const secondId = second.body.data.id as string;
    const filtered = await request(context.app)
      .get(
        "/api/global-mapping-profiles?provider=connectwise&entity=client&direction=inbound&isActive=true",
      )
      .expect(200);
    expect(filtered.body.data).toHaveLength(1);
    await request(context.app)
      .put(`/api/global-mapping-profiles/${secondId}`)
      .send({
        ...mappingBody,
        version: 0,
        fieldMappings: null,
        isActive: false,
      })
      .expect(200);
    await request(context.app)
      .post(`/api/global-mapping-profiles/${secondId}/activate`)
      .expect(200);
    expect((await context.globals.get(firstId))?.isActive).toBe(false);
    await request(context.app)
      .delete(`/api/global-mapping-profiles/${secondId}`)
      .expect(404);
  });

  it("enforces tenant ownership and resolves tenant, global, then missing", async () => {
    const global = await context.globals.create(mappingBody);
    const fallback = await request(context.app)
      .get(
        `/api/tenants/${tenantA}/mapping-profiles/effective?provider=connectwise&entity=client&direction=inbound`,
      )
      .expect(200);
    expect(fallback.body.data).toMatchObject({
      origin: "global",
      profile: { id: global.id },
    });
    const tenant = await request(context.app)
      .post(`/api/tenants/${tenantA}/mapping-profiles`)
      .send({ ...mappingBody, version: -1 })
      .expect(201);
    const effective = await request(context.app)
      .get(
        `/api/tenants/${tenantA}/mapping-profiles/effective?provider=connectwise&entity=client&direction=inbound`,
      )
      .expect(200);
    expect(effective.body.data).toMatchObject({
      origin: "tenant",
      profile: { id: tenant.body.data.id },
    });
    await request(context.app)
      .get(`/api/tenants/${tenantB}/mapping-profiles/${tenant.body.data.id}`)
      .expect(404);
    await request(context.app)
      .post(
        `/api/tenants/${tenantB}/mapping-profiles/${tenant.body.data.id}/activate`,
      )
      .expect(404);
    const missing = await request(context.app)
      .get(
        `/api/tenants/${tenantA}/mapping-profiles/effective?provider=keka&entity=timesheet&direction=outbound`,
      )
      .expect(200);
    expect(missing.body.data).toEqual({ origin: "missing", profile: null });
    await request(context.app)
      .delete(`/api/tenants/${tenantA}/mapping-profiles/${tenant.body.data.id}`)
      .expect(404);
  });
});
