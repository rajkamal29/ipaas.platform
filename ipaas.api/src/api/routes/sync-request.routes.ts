import { Router } from "express";
import type { SyncRequestController } from "../controllers/sync-request.controller";

/**
 * @openapi
 * /api/tenants/{tenantId}/sync-requests:
 *   get:
 *     tags: [Sync Requests]
 *     summary: List a tenant's Sync Requests
 *     operationId: listSyncRequests
 *     parameters:
 *       - $ref: '#/components/parameters/TenantId'
 *       - name: source
 *         in: query
 *         required: false
 *         schema:
 *           $ref: '#/components/schemas/Provider'
 *       - name: target
 *         in: query
 *         required: false
 *         schema:
 *           $ref: '#/components/schemas/Provider'
 *     responses:
 *       '200':
 *         description: Sync Requests returned.
 *         headers:
 *           X-Request-ID:
 *             $ref: '#/components/headers/RequestId'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncRequestListEnvelope'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '422':
 *         $ref: '#/components/responses/ValidationError'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 *   post:
 *     tags: [Sync Requests]
 *     summary: Create a Sync Request
 *     operationId: createSyncRequest
 *     parameters:
 *       - $ref: '#/components/parameters/TenantId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SyncRequestWrite'
 *     responses:
 *       '201':
 *         description: Sync Request created.
 *         headers:
 *           X-Request-ID:
 *             $ref: '#/components/headers/RequestId'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncRequestEnvelope'
 *       '400':
 *         $ref: '#/components/responses/MalformedJson'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '413':
 *         $ref: '#/components/responses/PayloadTooLarge'
 *       '422':
 *         $ref: '#/components/responses/ValidationError'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 * /api/tenants/{tenantId}/sync-requests/{requestId}:
 *   get:
 *     tags: [Sync Requests]
 *     summary: Get a tenant-owned Sync Request
 *     operationId: getSyncRequest
 *     parameters:
 *       - $ref: '#/components/parameters/TenantId'
 *       - $ref: '#/components/parameters/RequestId'
 *     responses:
 *       '200':
 *         description: Sync Request returned.
 *         headers:
 *           X-Request-ID:
 *             $ref: '#/components/headers/RequestId'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncRequestEnvelope'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '422':
 *         $ref: '#/components/responses/ValidationError'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 *   put:
 *     tags: [Sync Requests]
 *     summary: Replace a Sync Request's mutable fields
 *     operationId: updateSyncRequest
 *     parameters:
 *       - $ref: '#/components/parameters/TenantId'
 *       - $ref: '#/components/parameters/RequestId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SyncRequestWrite'
 *     responses:
 *       '200':
 *         description: Sync Request updated.
 *         headers:
 *           X-Request-ID:
 *             $ref: '#/components/headers/RequestId'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncRequestEnvelope'
 *       '400':
 *         $ref: '#/components/responses/MalformedJson'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '413':
 *         $ref: '#/components/responses/PayloadTooLarge'
 *       '422':
 *         $ref: '#/components/responses/ValidationError'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 */

export function syncRequestRoutes(controller: SyncRequestController): Router {
  const router = Router({ mergeParams: true });
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.get("/:requestId", controller.get);
  router.put("/:requestId", controller.update);
  return router;
}
