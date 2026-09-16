import { Router } from "express";
import type { SyncEntityController } from "../controllers/sync-entity.controller";

export function syncEntityRoutes(controller: SyncEntityController): Router {
  const router = Router({ mergeParams: true });
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.get("/:entityId", controller.get);
  router.put("/:entityId", controller.update);
  return router;
}
