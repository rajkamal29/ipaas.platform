import path from "node:path";
import swaggerJSDoc from "swagger-jsdoc";

function normalizedPath(...segments: string[]): string {
  return path.join(...segments).replaceAll("\\", "/");
}

const options: swaggerJSDoc.OAS3Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "iPaaS Platform API",
      version: "0.1.0",
      description:
        "HTTP API for tenant, sync-request, and sync-entity configuration.",
    },
    servers: [{ url: "/", description: "Current API origin" }],
    tags: [
      { name: "Health", description: "Liveness and database readiness" },
      { name: "Tenants", description: "Tenant configuration" },
      { name: "Sync Requests", description: "Tenant-owned provider pairings" },
      { name: "Sync Entities", description: "Request-owned entity schedules" },
    ],
  },
  apis: [
    normalizedPath(__dirname, "components.{ts,js}"),
    normalizedPath(__dirname, "../routes/*.{ts,js}"),
  ],
  failOnErrors: true,
};

export const openApiDocument = swaggerJSDoc(
  options,
) as swaggerJSDoc.OAS3Definition;
