import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { openApiDocument } from "../../src/api/swagger/openapi";
import type { SyncEntityRepository } from "../../src/application/ports/sync-entity.repository";
import type { SyncRequestRepository } from "../../src/application/ports/sync-request.repository";
import type { TenantRepository } from "../../src/application/ports/tenant.repository";
import { SyncEntityUseCase } from "../../src/application/use-cases/sync-entity.use-case";
import { SyncRequestUseCase } from "../../src/application/use-cases/sync-request.use-case";
import { TenantUseCase } from "../../src/application/use-cases/tenant.use-case";

const tenants: TenantRepository = {
  list: async () => [],
  get: async () => null,
  create: async () => {
    throw new Error("Not used by documentation tests.");
  },
  update: async () => null,
};

const syncRequests: SyncRequestRepository = {
  list: async () => [],
  get: async () => null,
  create: async () => {
    throw new Error("Not used by documentation tests.");
  },
  update: async () => null,
};

const syncEntities: SyncEntityRepository = {
  list: async () => [],
  get: async () => null,
  create: async () => {
    throw new Error("Not used by documentation tests.");
  },
  update: async () => null,
};

const app = createApp({
  tenants: new TenantUseCase(tenants),
  syncRequests: new SyncRequestUseCase(tenants, syncRequests),
  syncEntities: new SyncEntityUseCase(tenants, syncRequests, syncEntities),
  checkReadiness: async () => undefined,
  logger: { info: () => undefined, error: () => undefined },
});

const requiredOperations = [
  ["/health", "get"],
  ["/ready", "get"],
  ["/api/tenants", "get"],
  ["/api/tenants", "post"],
  ["/api/tenants/{tenantId}", "get"],
  ["/api/tenants/{tenantId}", "put"],
  ["/api/tenants/{tenantId}/sync-requests", "get"],
  ["/api/tenants/{tenantId}/sync-requests", "post"],
  ["/api/tenants/{tenantId}/sync-requests/{requestId}", "get"],
  ["/api/tenants/{tenantId}/sync-requests/{requestId}", "put"],
  ["/api/tenants/{tenantId}/sync-requests/{requestId}/entities", "get"],
  ["/api/tenants/{tenantId}/sync-requests/{requestId}/entities", "post"],
  [
    "/api/tenants/{tenantId}/sync-requests/{requestId}/entities/{entityId}",
    "get",
  ],
  [
    "/api/tenants/{tenantId}/sync-requests/{requestId}/entities/{entityId}",
    "put",
  ],
] as const;

function collectLocalReferences(value: unknown, references: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectLocalReferences(item, references));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && typeof child === "string" && child.startsWith("#/"))
      references.push(child);
    else collectLocalReferences(child, references);
  }
}

function resolveLocalReference(document: unknown, reference: string): unknown {
  return reference
    .slice(2)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>((current, segment) => {
      if (current === null || typeof current !== "object") return undefined;
      return (current as Readonly<Record<string, unknown>>)[segment];
    }, document);
}

describe("Swagger/OpenAPI documentation", () => {
  it("generates a valid OpenAPI 3 document with resolvable local references", () => {
    expect(openApiDocument.openapi).toBe("3.0.3");
    expect(openApiDocument.info.title).toBe("iPaaS Platform API");
    expect(openApiDocument.paths).toBeDefined();
    const references: string[] = [];
    collectLocalReferences(openApiDocument, references);
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references)
      expect(
        resolveLocalReference(openApiDocument, reference),
        reference,
      ).toBeDefined();
  });

  it("documents every currently implemented API operation", () => {
    const paths = openApiDocument.paths ?? {};
    for (const [path, method] of requiredOperations) {
      expect(paths[path], path).toBeDefined();
      expect(
        paths[path]?.[method],
        `${method.toUpperCase()} ${path}`,
      ).toBeDefined();
    }
  });

  it("serves the interactive UI and generated JSON through the Express app", async () => {
    const ui = await request(app).get("/api-docs").redirects(1).expect(200);
    expect(ui.headers["content-type"]).toMatch(/text\/html/);
    expect(ui.text).toContain('id="swagger-ui"');
    expect(ui.text).toContain("iPaaS Platform API documentation");

    const specification = await request(app)
      .get("/api-docs/swagger.json")
      .expect("content-type", /json/)
      .expect(200);
    expect(specification.body).toEqual(openApiDocument);
    expect(specification.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("contains no credential secrets or internal encryption values", () => {
    const serialized = JSON.stringify(openApiDocument);
    expect(serialized).not.toMatch(
      /LocalPocPassword|ENCRYPTION_MASTER_KEY|encryptionMasterKey|encryptedValue|ciphertext|clientSecret|privateKey/i,
    );
  });
});
