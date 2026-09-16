import { Router } from "express";
import type { SyncRequestController } from "../controllers/sync-request.controller";

export function syncRequestRoutes(controller: SyncRequestController): Router {
  const router = Router({ mergeParams: true });
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.get("/:requestId", controller.get);
  router.put("/:requestId", controller.update);
  return router;
}
