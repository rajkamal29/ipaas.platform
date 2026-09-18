import { Router } from "express";
import type { TenantController } from "../controllers/tenant.controller";

/**
 * @openapi
 * /api/tenants:
 *   get:
 *     tags: [Tenants]
 *     summary: List tenants
 *     operationId: listTenants
 *     parameters:
 *       - name: name
 *         in: query
 *         required: false
 *         description: Exact tenant-name filter.
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Tenants returned.
 *         headers:
 *           X-Request-ID:
 *             $ref: '#/components/headers/RequestId'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TenantListEnvelope'
 *       '422':
 *         $ref: '#/components/responses/ValidationError'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 *   post:
 *     tags: [Tenants]
 *     summary: Create a tenant
 *     operationId: createTenant
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TenantWrite'
 *     responses:
 *       '201':
 *         description: Tenant created.
 *         headers:
 *           X-Request-ID:
 *             $ref: '#/components/headers/RequestId'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TenantEnvelope'
 *       '400':
 *         $ref: '#/components/responses/MalformedJson'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 *       '413':
 *         $ref: '#/components/responses/PayloadTooLarge'
 *       '422':
 *         $ref: '#/components/responses/ValidationError'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 * /api/tenants/{tenantId}:
 *   get:
 *     tags: [Tenants]
 *     summary: Get a tenant
 *     operationId: getTenant
 *     parameters:
 *       - $ref: '#/components/parameters/TenantId'
 *     responses:
 *       '200':
 *         description: Tenant returned.
 *         headers:
 *           X-Request-ID:
 *             $ref: '#/components/headers/RequestId'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TenantEnvelope'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '422':
 *         $ref: '#/components/responses/ValidationError'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 *   put:
 *     tags: [Tenants]
 *     summary: Replace a tenant's mutable fields
 *     operationId: updateTenant
 *     parameters:
 *       - $ref: '#/components/parameters/TenantId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TenantWrite'
 *     responses:
 *       '200':
 *         description: Tenant updated.
 *         headers:
 *           X-Request-ID:
 *             $ref: '#/components/headers/RequestId'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TenantEnvelope'
 *       '400':
 *         $ref: '#/components/responses/MalformedJson'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 *       '413':
 *         $ref: '#/components/responses/PayloadTooLarge'
 *       '422':
 *         $ref: '#/components/responses/ValidationError'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 */

export function tenantRoutes(controller: TenantController): Router {
  const router = Router();
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.get("/:tenantId", controller.get);
  router.put("/:tenantId", controller.update);
  return router;
}
