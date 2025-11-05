import { z } from 'zod';

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
