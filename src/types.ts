import { Request, Response } from 'express';

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp?: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
}

// Extend Express Request/Response types if needed
export type TypedRequest<T = unknown> = Request<unknown, unknown, T>;
export type TypedResponse<T = unknown> = Response<T>;
