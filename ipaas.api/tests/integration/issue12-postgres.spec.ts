import path from "node:path";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CredentialWrite } from "../../src/application/ports/credential.repository";
import { CanonicalEntityUseCase } from "../../src/application/use-cases/canonical-entity.use-case";
import { CredentialUseCase } from "../../src/application/use-cases/credential.use-case";
import { GlobalMappingProfileUseCase } from "../../src/application/use-cases/global-mapping-profile.use-case";
import { MappingProfileUseCase } from "../../src/application/use-cases/mapping-profile.use-case";
import { TenantUseCase } from "../../src/application/use-cases/tenant.use-case";
import { PostgresCanonicalEntityRepository } from "../../src/infrastructure/postgres/canonical-entity.repository";
import { PostgresCredentialRepository } from "../../src/infrastructure/postgres/credential.repository";
import { PostgresGlobalMappingProfileRepository } from "../../src/infrastructure/postgres/global-mapping-profile.repository";
import { PostgresMappingProfileRepository } from "../../src/infrastructure/postgres/mapping-profile.repository";
import { createPool } from "../../src/infrastructure/postgres/pool";
import { PostgresTenantRepository } from "../../src/infrastructure/postgres/tenant.repository";
import { AesGcmCredentialEncryptor } from "../../src/infrastructure/security/aes-gcm-credential-encryptor";

const databaseUrl = process.env["TEST_DATABASE_URL"];
const schema = "ipaas_api_issue_12_test";
const suite = describe.skipIf(databaseUrl === undefined);

suite(
  "Issue #12 repositories against authoritative PostgreSQL migrations",
  () => {
    let admin: Pool;
    let pool: Pool;
    let tenants: TenantUseCase;
    let credentials: CredentialUseCase;
    let credentialRepository: PostgresCredentialRepository;
    let canonical: CanonicalEntityUseCase;
    let globals: GlobalMappingProfileUseCase;
    let mappings: MappingProfileUseCase;

    beforeAll(async () => {
      admin = new Pool({ connectionString: databaseUrl });
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.query(`CREATE SCHEMA ${schema}`);
      await runner({
        databaseUrl: databaseUrl!,
        dir: path.resolve(process.cwd(), "../ipaas.infra/migrations"),
        direction: "up",
        migrationsTable: "pgmigrations",
        schema,
        createSchema: false,
        count: Infinity,
        log: () => undefined,
      });
      const scopedUrl = new URL(databaseUrl!);
      scopedUrl.searchParams.set("options", `-csearch_path=${schema}`);
      pool = createPool(scopedUrl.toString());
      const tenantRepository = new PostgresTenantRepository(pool);
      credentialRepository = new PostgresCredentialRepository(pool);
      const canonicalRepository = new PostgresCanonicalEntityRepository(pool);
      const globalRepository = new PostgresGlobalMappingProfileRepository(pool);
      const mappingRepository = new PostgresMappingProfileRepository(pool);
      tenants = new TenantUseCase(tenantRepository);
      credentials = new CredentialUseCase(
        tenantRepository,
        credentialRepository,
        new AesGcmCredentialEncryptor(randomBytes(32).toString("base64")),
      );
      canonical = new CanonicalEntityUseCase(canonicalRepository);
      globals = new GlobalMappingProfileUseCase(globalRepository);
      mappings = new MappingProfileUseCase(
        tenantRepository,
        mappingRepository,
        globalRepository,
      );
    });

    afterAll(async () => {
      if (pool !== undefined) await pool.end();
      if (admin !== undefined) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });

    it("persists encrypted credentials atomically and supports same-provider configuration", async () => {
      const tenant = await tenants.create({
        body: { name: "Credential owner" },
      });
      const configured = await credentials.configure(tenant.id, {
        body: {
          source: "connectwise",
          sourceSecret: "integration-source-value",
          target: "keka",
          targetSecret: "integration-target-value",
        },
      });
      expect(configured).toHaveLength(2);
      const stored = await pool.query<{
        provider: string;
        encrypted_payload: Buffer;
        iv: Buffer;
        auth_tag: Buffer;
      }>(
        "SELECT provider, encrypted_payload, iv, auth_tag FROM credentials WHERE tenant_id = $1",
        [tenant.id],
      );
      expect(stored.rows).toHaveLength(2);
      expect(
        stored.rows.every(
          (row) =>
            row.encrypted_payload.length > 0 &&
            row.iv.length === 12 &&
            row.auth_tag.length === 16,
        ),
      ).toBe(true);
      expect(
        JSON.stringify(
          stored.rows.map((row) => row.encrypted_payload.toString("utf8")),
        ),
      ).not.toMatch(/integration-(source|target)-value/);

      const one = await credentials.configure(tenant.id, {
        body: {
          source: "connectwise",
          sourceSecret: "same",
          target: "connectwise",
          targetSecret: "same",
        },
      });
      expect(one).toHaveLength(1);
      expect(
        await pool.query(
          "SELECT count(*)::integer AS count FROM credentials WHERE tenant_id = $1",
          [tenant.id],
        ),
      ).toMatchObject({ rows: [{ count: 2 }] });
    });

    it("rolls back all credential writes when a later write violates PostgreSQL constraints", async () => {
      const tenant = await tenants.create({ body: { name: "Rollback owner" } });
      const encrypted = new AesGcmCredentialEncryptor(
        randomBytes(32).toString("base64"),
      ).encrypt("value");
      const writes = [
        { provider: "connectwise", encrypted },
        { provider: "unsupported", encrypted },
      ] as unknown as readonly CredentialWrite[];
      await expect(
        credentialRepository.configure(tenant.id, writes),
      ).rejects.toMatchObject({ code: "validation" });
      expect(
        await pool.query(
          "SELECT count(*)::integer AS count FROM credentials WHERE tenant_id = $1",
          [tenant.id],
        ),
      ).toMatchObject({ rows: [{ count: 0 }] });
    });

    it("reads canonical schemas with JSONB and signed integer versions", async () => {
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO canonical_entities (name, version, schema)
       VALUES ('client', -1, $1::jsonb) RETURNING id`,
        [JSON.stringify({ type: "object", required: ["id", "name"] })],
      );
      const listed = await canonical.list({ name: "client", version: "-1" });
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        id: inserted.rows[0]!.id,
        version: -1,
        schema: { type: "object" },
      });
    });

    it("persists JSON mappings, enforces active uniqueness, activates transactionally, and resolves precedence", async () => {
      const tenant = await tenants.create({ body: { name: "Mapping owner" } });
      const key = {
        provider: "connectwise",
        entity: "client",
        direction: "inbound",
      } as const;
      const globalOne = await globals.create({
        body: { ...key, version: 1, fieldMappings: null },
      });
      const globalTwo = await globals.create({
        body: {
          ...key,
          version: 2,
          fieldMappings: [{ canonicalField: "id", sourceField: "id" }],
          isActive: false,
        },
      });
      await expect(
        globals.create({ body: { ...key, version: 3, fieldMappings: [] } }),
      ).rejects.toMatchObject({ code: "conflict" });
      expect((await globals.activate(globalTwo.id)).isActive).toBe(true);
      expect((await globals.get(globalOne.id)).isActive).toBe(false);

      expect(await mappings.resolveEffective(tenant.id, key)).toMatchObject({
        origin: "global",
        profile: { id: globalTwo.id },
      });
      const tenantInactive = await mappings.create(tenant.id, {
        body: { ...key, version: 1, fieldMappings: [], isActive: false },
      });
      expect(await mappings.resolveEffective(tenant.id, key)).toMatchObject({
        origin: "global",
      });
      await mappings.activate(tenant.id, tenantInactive.id);
      expect(await mappings.resolveEffective(tenant.id, key)).toMatchObject({
        origin: "tenant",
        profile: { id: tenantInactive.id },
      });
      const json = await pool.query<{ field_mappings: unknown }>(
        "SELECT field_mappings FROM mapping_profiles WHERE id = $1",
        [tenantInactive.id],
      );
      expect(json.rows[0]?.field_mappings).toEqual([]);
    });
  },
);
