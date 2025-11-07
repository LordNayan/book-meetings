import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { availabilityQuerySchema } from './validation';
import { prisma } from '../db';
import { logger } from '../logger';
import { findOverlaps } from '../core/overlap';
import { findGaps } from '../core/gaps';

dayjs.extend(utc);

export const availabilityRouter = Router();

/**
 * @swagger
 * /availability:
 *   get:
 *     summary: Get available time slots for a resource
 *     description: Computes available time slots for a resource within a specified time window, considering existing bookings (single and recurring)
 *     tags:
 *       - Availability
 *     parameters:
 *       - in: query
 *         name: resource_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the resource to check availability for
 *         example: 550e8400-e29b-41d4-a716-446655440001
 *       - in: query
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start of the time window (ISO 8601 format)
 *         example: 2025-11-07T00:00:00.000Z
 *       - in: query
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End of the time window (ISO 8601 format)
 *         example: 2025-11-08T00:00:00.000Z
 *       - in: query
 *         name: slot
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Minimum slot duration in minutes
 *         example: 30
 *     responses:
 *       200:
 *         description: Successfully computed available slots
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AvailabilityResponse'
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: Resource not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: Resource not found
 *               message: Resource with ID 550e8400-e29b-41d4-a716-446655440001 does not exist
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
availabilityRouter.get('/', async (req: Request, res: Response) => {
  try {
    // Validate query parameters
    const query = availabilityQuerySchema.parse(req.query);

    const resourceId = query.resource_id;
    const fromTime = new Date(query.from);
    const toTime = new Date(query.to);
    const slotDuration = query.slot;

    logger.info(
      {
        resourceId,
        fromTime,
        toTime,
        slotDuration,
      },
      'Processing availability request'
    );

    // Verify resource exists
    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      return res.status(404).json({
        error: 'Resource not found',
        message: `Resource with ID ${resourceId} does not exist`,
      });
    }

    // Find all overlapping bookings (single and recurring)
    const busyInstances = await findOverlaps(resourceId, fromTime, toTime);

    logger.debug(
      { busyInstancesCount: busyInstances.length },
      'Found busy instances'
    );

    // Convert busy instances to time slots
    const busySlots = busyInstances.map((instance) => ({
      start: instance.start,
      end: instance.end,
    }));

    // Find gaps (available periods) between busy slots
    const availableSlots = findGaps(
      busySlots,
      fromTime,
      toTime,
      slotDuration // Minimum gap duration
    );

    logger.info(
      { availableSlotsCount: availableSlots.length },
      'Computed available slots'
    );

    return res.status(200).json({
      resource_id: resourceId,
      resource_name: resource.name,
      from: fromTime.toISOString(),
      to: toTime.toISOString(),
      slot_duration_minutes: slotDuration,
      available_slots: availableSlots.map((slot) => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        duration_minutes: dayjs.utc(slot.end).diff(dayjs.utc(slot.start), 'minute'),
      })),
      busy_slots_count: busySlots.length,
    });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid query parameters',
        details: error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        })),
      });
    }

    // Handle other errors
    logger.error({ error }, 'Error computing availability');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while computing availability',
    });
  }
});
