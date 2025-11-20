import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { prisma } from '../db';
import { logger } from '../logger';
import { config } from '../config';
import { hasConflict } from '../core/overlap';
import { expandOccurrences, validateRRule } from '../core/rrule';
import { computeNextAvailable } from '../core/gaps';

dayjs.extend(utc);

export interface CreateBookingInput {
  resource_id: string;
  start_time: string;
  end_time: string;
  recurrence_rule?: string;
  exceptions?: Array<{
    date: string;
    replace_start?: string;
    replace_end?: string;
  }>;
  metadata?: Record<string, any>;
}

export interface BookingResult {
  status: 'success' | 'conflict';
  booking?: any;
  message?: string;
  conflicts?: any[];
  next_available?: any[];
}

export class BookingService {
  /**
   * Check if a resource exists
   */
  async verifyResource(resourceId: string): Promise<boolean> {
    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
    });
    return !!resource;
  }

  /**
   * Create a single (non-recurring) booking
   */
  async createSingleBooking(
    resourceId: string,
    startTime: Date,
    endTime: Date,
    metadata?: Record<string, any>
  ): Promise<BookingResult> {
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

      return {
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
      };
    }

    // No conflict - create the booking
    const booking = await prisma.booking.create({
      data: {
        resourceId,
        startTime,
        endTime,
        metadata: metadata || {},
      },
    });

    logger.info({ bookingId: booking.id }, 'Created single booking');

    return {
      status: 'success',
      booking: {
        id: booking.id,
        resource_id: booking.resourceId,
        start_time: booking.startTime.toISOString(),
        end_time: booking.endTime.toISOString(),
        metadata: booking.metadata,
        created_at: booking.createdAt.toISOString(),
        is_recurring: false,
        recurrence_rule: null,
        exceptions: [],
      },
    };
  }

  /**
   * Create a recurring booking
   */
  async createRecurringBooking(
    resourceId: string,
    startTime: Date,
    endTime: Date,
    recurrenceRule: string,
    exceptions: Array<{
      date: string;
      replace_start?: string;
      replace_end?: string;
    }> = [],
    metadata?: Record<string, any>
  ): Promise<BookingResult> {
    // Validate RRULE
    if (!validateRRule(recurrenceRule)) {
      throw new Error('Invalid recurrence rule');
    }

    // Expand occurrences within validation window (configurable days)
    const expansionDays = parseInt(config.recurrenceExpansionDays, 10);
    const validationWindowEnd = dayjs.utc(startTime).add(expansionDays, 'day').toDate();

    // Convert exceptions to the format expected by expandOccurrences
    const parsedExceptions = exceptions.map((exc) => ({
      exceptDate: new Date(exc.date),
      replaceStart: exc.replace_start ? new Date(exc.replace_start) : undefined,
      replaceEnd: exc.replace_end ? new Date(exc.replace_end) : undefined,
    }));

    const occurrences = expandOccurrences(
      recurrenceRule,
      startTime,
      validationWindowEnd,
      startTime,
      endTime,
      parsedExceptions
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

      return {
        status: 'conflict',
        message: `${allConflicts.length} occurrence(s) conflict with existing bookings`,
        conflicts: flatConflicts,
        next_available: availability.suggestions.map((slot) => ({
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
        })),
      };
    }

    // No conflicts - create the recurring booking
    const booking = await prisma.booking.create({
      data: {
        resourceId,
        startTime,
        endTime,
        metadata: metadata || {},
        recurrenceRule: {
          create: {
            rrule: recurrenceRule,
            isInfinite: !recurrenceRule.includes('COUNT') && !recurrenceRule.includes('UNTIL'),
          },
        },
        exceptions: {
          create: parsedExceptions.map((exc) => ({
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

    return {
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
    };
  }

  /**
   * Main method to create a booking (single or recurring)
   */
  async createBooking(input: CreateBookingInput): Promise<BookingResult> {
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

    if (isRecurring) {
      return this.createRecurringBooking(
        resourceId,
        startTime,
        endTime,
        input.recurrence_rule!,
        input.exceptions || [],
        input.metadata
      );
    } else {
      return this.createSingleBooking(resourceId, startTime, endTime, input.metadata);
    }
  }
}

export const bookingService = new BookingService();
