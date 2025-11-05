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
 * POST /bookings
 * Creates a new booking (single or recurring) with conflict detection
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
      return res.status(409).json({
        status: 'conflict',
        message: `${allConflicts.length} occurrence(s) conflict with existing bookings`,
        conflicting_occurrences: allConflicts.map((c) => ({
          start: c.occurrence_start,
          end: c.occurrence_end,
          conflicts: c.conflicts.map((conflict) => ({
            booking_id: conflict.bookingId,
            start: conflict.start.toISOString(),
            end: conflict.end.toISOString(),
            is_recurring: conflict.isRecurring,
          })),
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
