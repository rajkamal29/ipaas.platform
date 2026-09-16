import { Router } from "express";
import type { GlobalMappingProfileController } from "../controllers/global-mapping-profile.controller";

export function globalMappingProfileRoutes(
  controller: GlobalMappingProfileController,
): Router {
  const router = Router();
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.post("/:profileId/activate", controller.activate);
  router.get("/:profileId", controller.get);
  router.put("/:profileId", controller.update);
  return router;
}
