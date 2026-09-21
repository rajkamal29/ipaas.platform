import { Router } from "express";
import type { SyncEntityController } from "../controllers/sync-entity.controller";

/**
 * @openapi
 * /api/tenants/{tenantId}/sync-requests/{requestId}/entities:
 *   get:
 *     tags: [Sync Entities]
 *     summary: List a Sync Request's entities
 *     operationId: listSyncEntities
 *     parameters:
 *       - $ref: '#/components/parameters/TenantId'
 *       - $ref: '#/components/parameters/RequestId'
 *     responses:
 *       '200':
 *         description: Sync Entities returned.
 *         headers:
 *           X-Request-ID:
 *             $ref: '#/components/headers/RequestId'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncEntityReadListEnvelope'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '422':
 *         $ref: '#/components/responses/ValidationError'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 *   post:
 *     tags: [Sync Entities]
 *     summary: Create a Sync Entity
 *     operationId: createSyncEntity
 *     parameters:
 *       - $ref: '#/components/parameters/TenantId'
 *       - $ref: '#/components/parameters/RequestId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SyncEntityCreate'
 *     responses:
 *       '201':
 *         description: Sync Entity created.
 *         headers:
 *           X-Request-ID:
 *             $ref: '#/components/headers/RequestId'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncEntityEnvelope'
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
 * /api/tenants/{tenantId}/sync-requests/{requestId}/entities/{entityId}:
 *   get:
 *     tags: [Sync Entities]
 *     summary: Get an owned Sync Entity
 *     operationId: getSyncEntity
 *     parameters:
 *       - $ref: '#/components/parameters/TenantId'
 *       - $ref: '#/components/parameters/RequestId'
 *       - $ref: '#/components/parameters/EntityId'
 *     responses:
 *       '200':
 *         description: Sync Entity returned.
 *         headers:
 *           X-Request-ID:
 *             $ref: '#/components/headers/RequestId'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncEntityReadEnvelope'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '422':
 *         $ref: '#/components/responses/ValidationError'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 *   put:
 *     tags: [Sync Entities]
 *     summary: Replace a Sync Entity's mutable fields
 *     operationId: updateSyncEntity
 *     parameters:
 *       - $ref: '#/components/parameters/TenantId'
 *       - $ref: '#/components/parameters/RequestId'
 *       - $ref: '#/components/parameters/EntityId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SyncEntityUpdate'
 *     responses:
 *       '200':
 *         description: Sync Entity updated.
 *         headers:
 *           X-Request-ID:
 *             $ref: '#/components/headers/RequestId'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncEntityEnvelope'
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

export function syncEntityRoutes(controller: SyncEntityController): Router {
  const router = Router({ mergeParams: true });
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.get("/:entityId", controller.get);
  router.put("/:entityId", controller.update);
  return router;
}
