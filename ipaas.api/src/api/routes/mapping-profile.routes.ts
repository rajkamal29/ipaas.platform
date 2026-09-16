import { Router } from "express";
import type { MappingProfileController } from "../controllers/mapping-profile.controller";

export function mappingProfileRoutes(
  controller: MappingProfileController,
): Router {
  const router = Router({ mergeParams: true });
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.get("/effective", controller.effective);
  router.post("/:profileId/activate", controller.activate);
  router.get("/:profileId", controller.get);
  router.put("/:profileId", controller.update);
  return router;
}
