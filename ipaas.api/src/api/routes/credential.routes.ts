import { Router } from "express";
import type { CredentialController } from "../controllers/credential.controller";

export function credentialRoutes(controller: CredentialController): Router {
  const router = Router({ mergeParams: true });
  router.get("/", controller.list);
  router.post("/", controller.configure);
  router.get("/:provider", controller.get);
  return router;
}
