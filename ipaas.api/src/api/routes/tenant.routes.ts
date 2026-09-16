import { Router } from "express";
import type { TenantController } from "../controllers/tenant.controller";

export function tenantRoutes(controller: TenantController): Router {
  const router = Router();
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.get("/:tenantId", controller.get);
  router.put("/:tenantId", controller.update);
  return router;
}
