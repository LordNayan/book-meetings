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

// Core booking types
export interface BookingException {
  exceptDate: Date;
  replaceStart?: Date;
  replaceEnd?: Date;
}

export interface BookingInstance {
  bookingId: string;
  start: Date;
  end: Date;
  isRecurring?: boolean;
}

export interface ConflictInfo {
  hasConflict: boolean;
  conflicts: BookingInstance[];
}

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface AvailabilityResult {
  suggestions: TimeSlot[];
  searchedUntil: Date;
}
