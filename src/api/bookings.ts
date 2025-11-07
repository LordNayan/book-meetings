import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { createBookingSchema } from './validation';
import { prisma } from '../db';
import { logger } from '../logger';
import { hasConflict } from '../core/overlap';
import { expandOccurrences, validateRRule } from '../core/rrule';
import { computeNextAvailable } from '../core/gaps';

dayjs.extend(utc);

export const bookingsRouter = Router();

/**
 * @swagger
 * /bookings:
 *   post:
 *     summary: Create a new booking
 *     description: Creates a new booking (single or recurring) with automatic conflict detection. Returns conflicts with suggestions if the requested time is unavailable.
 *     tags:
 *       - Bookings
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BookingRequest'
 *           examples:
 *             singleBooking:
 *               summary: Single booking
 *               value:
 *                 resource_id: 550e8400-e29b-41d4-a716-446655440001
 *                 start_time: "2025-11-07T09:00:00.000Z"
 *                 end_time: "2025-11-07T10:00:00.000Z"
 *                 metadata:
 *                   title: "Team Meeting"
 *                   attendees: 5
 *             recurringBooking:
 *               summary: Recurring booking
 *               value:
 *                 resource_id: 550e8400-e29b-41d4-a716-446655440001
 *                 start_time: "2025-11-07T09:00:00.000Z"
 *                 end_time: "2025-11-07T10:00:00.000Z"
 *                 recurrence_rule: "FREQ=DAILY;COUNT=5"
 *                 metadata:
 *                   title: "Daily Standup"
 *             recurringWithExceptions:
 *               summary: Recurring booking with exceptions
 *               value:
 *                 resource_id: 550e8400-e29b-41d4-a716-446655440001
 *                 start_time: "2025-11-07T09:00:00.000Z"
 *                 end_time: "2025-11-07T10:00:00.000Z"
 *                 recurrence_rule: "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10"
 *                 exceptions:
 *                   - date: "2025-11-15T00:00:00.000Z"
 *                   - date: "2025-11-20T00:00:00.000Z"
 *                     replace_start: "2025-11-20T14:00:00.000Z"
 *                     replace_end: "2025-11-20T15:00:00.000Z"
 *                 metadata:
 *                   title: "Weekly Review"
 *     responses:
 *       201:
 *         description: Booking created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BookingSuccessResponse'
 *       400:
 *         description: Invalid request body or validation error
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
 *       409:
 *         description: Booking conflict detected
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConflictResponse'
 *             examples:
 *               singleBookingConflict:
 *                 summary: Single booking conflict
 *                 value:
 *                   status: conflict
 *                   message: Time slot conflicts with existing bookings
 *                   conflicts:
 *                     - booking_id: "123e4567-e89b-12d3-a456-426614174000"
 *                       start: "2025-11-07T09:00:00.000Z"
 *                       end: "2025-11-07T10:00:00.000Z"
 *                       is_recurring: false
 *                   next_available:
 *                     - start: "2025-11-07T10:00:00.000Z"
 *                       end: "2025-11-07T11:00:00.000Z"
 *                     - start: "2025-11-07T11:00:00.000Z"
 *                       end: "2025-11-07T12:00:00.000Z"
 *               recurringBookingConflict:
 *                 summary: Recurring booking conflict
 *                 value:
 *                   status: conflict
 *                   message: 2 occurrence(s) conflict with existing bookings
 *                   conflicts:
 *                     - booking_id: "123e4567-e89b-12d3-a456-426614174000"
 *                       start: "2025-11-07T09:00:00.000Z"
 *                       end: "2025-11-07T10:00:00.000Z"
 *                       is_recurring: false
 *                       occurrence_start: "2025-11-07T09:00:00.000Z"
 *                       occurrence_end: "2025-11-07T10:00:00.000Z"
 *                     - booking_id: "987e6543-e21b-98d7-b654-789456123000"
 *                       start: "2025-11-08T09:00:00.000Z"
 *                       end: "2025-11-08T10:00:00.000Z"
 *                       is_recurring: true
 *                       occurrence_start: "2025-11-08T09:00:00.000Z"
 *                       occurrence_end: "2025-11-08T10:00:00.000Z"
 *                   next_available:
 *                     - start: "2025-11-07T10:00:00.000Z"
 *                       end: "2025-11-07T11:00:00.000Z"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
bookingsRouter.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const input = createBookingSchema.parse(req.body);

    const startTime = new Date(input.start_time);
    const endTime = new Date(input.end_time);
    const resourceId = input.resource_id;
    const isRecurring = !!input.recurrence_rule;

    logger.info(
      {
        resourceId,
        startTime,
        endTime,
        isRecurring,
      },
      'Processing booking request'
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

    // Handle single booking
    if (!isRecurring) {
      // Check for conflicts
      const conflictCheck = await hasConflict(resourceId, startTime, endTime);

      if (conflictCheck.hasConflict) {
        // Compute next available slots
        const durationMinutes = dayjs.utc(endTime).diff(dayjs.utc(startTime), 'minute');
        const availability = await computeNextAvailable(
          resourceId,
          startTime,
          durationMinutes,
          720, // Search 30 days ahead
          15, // 15-minute increments
          5 // Max 5 suggestions
        );

        return res.status(409).json({
          status: 'conflict',
          message: 'Time slot conflicts with existing bookings',
          conflicts: conflictCheck.conflicts.map((c) => ({
            booking_id: c.bookingId,
            start: c.start.toISOString(),
            end: c.end.toISOString(),
            is_recurring: c.isRecurring,
          })),
          next_available: availability.suggestions.map((slot) => ({
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
          })),
        });
      }

      // No conflict - create the booking
      const booking = await prisma.booking.create({
        data: {
          resourceId,
          startTime,
          endTime,
          metadata: input.metadata || {},
        },
      });

      logger.info({ bookingId: booking.id }, 'Created single booking');

      return res.status(201).json({
        status: 'success',
        booking: {
          id: booking.id,
          resource_id: booking.resourceId,
          start_time: booking.startTime.toISOString(),
          end_time: booking.endTime.toISOString(),
          metadata: booking.metadata,
          created_at: booking.createdAt.toISOString(),
          is_recurring: false,
        },
      });
    }

    // Handle recurring booking
    if (!validateRRule(input.recurrence_rule!)) {
      return res.status(400).json({
        error: 'Invalid recurrence rule',
        message: 'The provided RRULE string is invalid',
      });
    }

    // Expand occurrences within validation window (90 days)
    const validationWindowEnd = dayjs.utc(startTime).add(90, 'day').toDate();

    // Convert exceptions to the format expected by expandOccurrences
    const exceptions = (input.exceptions || []).map((exc) => ({
      exceptDate: new Date(exc.date),
      replaceStart: exc.replace_start ? new Date(exc.replace_start) : undefined,
      replaceEnd: exc.replace_end ? new Date(exc.replace_end) : undefined,
    }));

    const occurrences = expandOccurrences(
      input.recurrence_rule!,
      startTime,
      validationWindowEnd,
      startTime,
      endTime,
      exceptions
    );

    logger.info(
      { occurrencesCount: occurrences.length },
      'Expanded recurring booking occurrences'
    );

    // Check each occurrence for conflicts
    const allConflicts = [];
    for (const occurrence of occurrences) {
      const conflictCheck = await hasConflict(
        resourceId,
        occurrence.start,
        occurrence.end
      );

      if (conflictCheck.hasConflict) {
        allConflicts.push({
          occurrence_start: occurrence.start.toISOString(),
          occurrence_end: occurrence.end.toISOString(),
          conflicts: conflictCheck.conflicts,
        });
      }
    }

    // If any conflicts found, return them
    if (allConflicts.length > 0) {
      // Flatten all conflicts into a single array for consistent response structure
      const flatConflicts = allConflicts.flatMap((c) =>
        c.conflicts.map((conflict) => ({
          booking_id: conflict.bookingId,
          start: conflict.start.toISOString(),
          end: conflict.end.toISOString(),
          is_recurring: conflict.isRecurring,
          occurrence_start: c.occurrence_start,
          occurrence_end: c.occurrence_end,
        }))
      );

      // Compute next available slots for recurring bookings
      const durationMinutes = dayjs.utc(endTime).diff(dayjs.utc(startTime), 'minute');
      const availability = await computeNextAvailable(
        resourceId,
        startTime,
        durationMinutes,
        720, // Search 30 days ahead
        15, // 15-minute increments
        5 // Max 5 suggestions
      );

      return res.status(409).json({
        status: 'conflict',
        message: `${allConflicts.length} occurrence(s) conflict with existing bookings`,
        conflicts: flatConflicts,
        next_available: availability.suggestions.map((slot) => ({
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
        })),
      });
    }

    // No conflicts - create the recurring booking
    const booking = await prisma.booking.create({
      data: {
        resourceId,
        startTime,
        endTime,
        metadata: input.metadata || {},
        recurrenceRule: {
          create: {
            rrule: input.recurrence_rule!,
            isInfinite: !input.recurrence_rule!.includes('COUNT') && !input.recurrence_rule!.includes('UNTIL'),
          },
        },
        exceptions: {
          create: exceptions.map((exc) => ({
            exceptDate: exc.exceptDate,
            replaceStart: exc.replaceStart,
            replaceEnd: exc.replaceEnd,
          })),
        },
      },
      include: {
        recurrenceRule: true,
        exceptions: true,
      },
    });

    logger.info({ bookingId: booking.id }, 'Created recurring booking');

    return res.status(201).json({
      status: 'success',
      booking: {
        id: booking.id,
        resource_id: booking.resourceId,
        start_time: booking.startTime.toISOString(),
        end_time: booking.endTime.toISOString(),
        metadata: booking.metadata,
        created_at: booking.createdAt.toISOString(),
        is_recurring: true,
        recurrence_rule: booking.recurrenceRule?.rrule,
        exceptions: booking.exceptions.map((exc: any) => ({
          date: exc.exceptDate.toISOString(),
          replace_start: exc.replaceStart?.toISOString(),
          replace_end: exc.replaceEnd?.toISOString(),
        })),
      },
    });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid request data',
        details: error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        })),
      });
    }

    // Handle other errors
    logger.error({ error }, 'Error creating booking');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while creating the booking',
    });
  }
});
