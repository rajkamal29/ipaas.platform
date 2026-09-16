import { Router } from "express";
import type { CanonicalEntityController } from "../controllers/canonical-entity.controller";

export function canonicalEntityRoutes(
  controller: CanonicalEntityController,
): Router {
  const router = Router();
  router.get("/", controller.list);
  router.get("/:canonicalEntityId", controller.get);
  return router;
}
