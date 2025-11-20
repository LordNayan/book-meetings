import express, { Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { config } from "./config";
import { logger } from "./logger";
import { HealthCheckResponse } from "./types";
import { bookingsRouter } from "./routes/bookings.routes";
import { availabilityRouter } from "./routes/availability.routes";
import { swaggerSpec } from "./swagger";

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, "Incoming request");
  next();
});

// Health check route
app.get("/health", (_req: Request, res: Response<HealthCheckResponse>) => {
  res.status(200).json({ status: "ok" });
});

// Swagger documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Book Meetings API Documentation",
  })
);

// Swagger JSON endpoint
app.get("/api-docs.json", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// API routes
app.use("/bookings", bookingsRouter);
app.use("/availability", availabilityRouter);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not Found", message: "Route not found" });
});

// Error handler
app.use(
  (err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
    logger.error({ err }, "Unhandled error");
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
);

export default app;

// Start server only if this file is run directly (not imported for testing)
if (require.main === module) {
  const PORT = parseInt(config.port, 10) || 3000;

  app.listen(PORT, () => {
    const baseUrl = `http://localhost:${PORT}`;
    logger.info(
      {
        api: baseUrl,
        swagger: `${baseUrl}/api-docs`,
      },
      "Server started successfully"
    );
  });
}
