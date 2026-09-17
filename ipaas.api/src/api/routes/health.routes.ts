import { Router } from "express";

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Check process liveness
 *     operationId: getHealth
 *     responses:
 *       '200':
 *         description: The API process is running.
 *         headers:
 *           X-Request-ID:
 *             $ref: '#/components/headers/RequestId'
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: false
 *               required: [status]
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ok]
 * /ready:
 *   get:
 *     tags: [Health]
 *     summary: Check database readiness
 *     operationId: getReadiness
 *     responses:
 *       '200':
 *         description: The API and database are ready.
 *         headers:
 *           X-Request-ID:
 *             $ref: '#/components/headers/RequestId'
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: false
 *               required: [status]
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ready]
 *       '503':
 *         description: The database is unavailable.
 *         headers:
 *           X-Request-ID:
 *             $ref: '#/components/headers/RequestId'
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: false
 *               required: [status]
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [unavailable]
 */

export function healthRoutes(checkReadiness: () => Promise<void>): Router {
  const router = Router();
  router.get("/health", (_request, response) =>
    response.status(200).json({ status: "ok" }),
  );
  router.get("/ready", async (_request, response) => {
    try {
      await checkReadiness();
      response.status(200).json({ status: "ready" });
    } catch {
      response.status(503).json({ status: "unavailable" });
    }
  });
  return router;
}
