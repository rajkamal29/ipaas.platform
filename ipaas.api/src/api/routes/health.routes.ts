import { Router } from "express";

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
