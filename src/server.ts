import express, { Request, Response } from 'express';
import { config } from './config';
import { logger } from './logger';
import { HealthCheckResponse } from './types';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, 'Incoming request');
  next();
});

// Health check route
app.get('/health', (_req: Request, res: Response<HealthCheckResponse>) => {
  res.status(200).json({ status: 'ok' });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found', message: 'Route not found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Start server
const PORT = parseInt(config.port, 10);

app.listen(PORT, () => {
  logger.info({ port: PORT, env: config.nodeEnv }, 'Server started successfully');
});

export default app;
