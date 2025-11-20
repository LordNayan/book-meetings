import { z } from 'zod';

/**
 * Schema for exception dates in recurring bookings
 */
const exceptionSchema = z.object({
  date: z.string().datetime(), // ISO 8601 date string
  replace_start: z.string().datetime().optional(),
  replace_end: z.string().datetime().optional(),
}).refine(
  (data) => {
    // If one replacement field is provided, both must be provided
    const hasReplaceStart = data.replace_start !== undefined;
    const hasReplaceEnd = data.replace_end !== undefined;
    return hasReplaceStart === hasReplaceEnd;
  },
  {
    message: 'Both replace_start and replace_end must be provided together',
  }
);

/**
 * Schema for creating a new booking (single or recurring)
 */
export const createBookingSchema = z.object({
  resource_id: z.string().uuid('Invalid resource ID format'),
  start_time: z.string().datetime('Invalid start_time format, expected ISO 8601'),
  end_time: z.string().datetime('Invalid end_time format, expected ISO 8601'),
  recurrence_rule: z.string().optional(),
  exceptions: z.array(exceptionSchema).optional(),
  metadata: z.record(z.any()).optional(),
}).refine(
  (data) => {
    // Ensure end_time is after start_time
    return new Date(data.end_time) > new Date(data.start_time);
  },
  {
    message: 'end_time must be after start_time',
    path: ['end_time'],
  }
).refine(
  (data) => {
    // Exceptions only allowed with recurrence_rule
    if (data.exceptions && data.exceptions.length > 0 && !data.recurrence_rule) {
      return false;
    }
    return true;
  },
  {
    message: 'exceptions can only be provided with recurrence_rule',
    path: ['exceptions'],
  }
);

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/**
 * Schema for querying availability
 */
export const availabilityQuerySchema = z.object({
  resource_id: z.string().uuid('Invalid resource ID format'),
  from: z.string().datetime('Invalid from format, expected ISO 8601'),
  to: z.string().datetime('Invalid to format, expected ISO 8601'),
  slot: z.string().optional().transform((val) => val ? parseInt(val, 10) : 60), // Default 60 minutes
}).refine(
  (data) => {
    // Ensure 'to' is after 'from'
    return new Date(data.to) > new Date(data.from);
  },
  {
    message: 'to must be after from',
    path: ['to'],
  }
);

export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
