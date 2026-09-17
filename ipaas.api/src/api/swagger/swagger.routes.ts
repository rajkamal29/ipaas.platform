import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiDocument } from "./openapi";

export function swaggerRoutes(): Router {
  const router = Router();
  router.get("/api-docs/swagger.json", (_request, response) => {
    response.status(200).json(openApiDocument);
  });
  router.use(
    "/swagger",
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: "iPaaS Platform API documentation",
    }),
  );
  return router;
}
