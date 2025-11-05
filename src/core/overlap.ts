import { logger } from '../logger';
import { BookingInstance, ConflictInfo } from '../types';
import { prisma } from '../db';
import { expandOccurrences } from './rrule';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

// Enable UTC plugin for consistent timezone handling
dayjs.extend(utc);

/**
 * Finds all overlapping bookings (single and recurring) for a resource within a time window.
 * 
 * @param resourceId - UUID of the resource to check
 * @param windowStart - Start of the time window
 * @param windowEnd - End of the time window
 * @returns Array of booking instances that overlap with the window
 */
export async function findOverlaps(
  resourceId: string,
  windowStart: Date,
  windowEnd: Date
): Promise<BookingInstance[]> {
  const instances: BookingInstance[] = [];

  try {
    // Query single (non-recurring) bookings using Prisma's raw query with range operator
    const singleResult = await prisma.$queryRaw<Array<{
      id: string;
      start_time: Date;
      end_time: Date;
    }>>`
      SELECT id, start_time, end_time
      FROM bookings
      WHERE resource_id = ${resourceId}::uuid
        AND time_range && tstzrange(${windowStart.toISOString()}::timestamptz, ${windowEnd.toISOString()}::timestamptz, '[)')
        AND id NOT IN (SELECT booking_id FROM recurrence_rules)
    `;

    // Add single bookings to instances
    for (const row of singleResult) {
      instances.push({
        bookingId: row.id,
        start: new Date(row.start_time),
        end: new Date(row.end_time),
        isRecurring: false,
      });
    }

    // Query recurring bookings using Prisma
    const recurringBookings = await prisma.booking.findMany({
      where: {
        resourceId,
        recurrenceRule: {
          isNot: null,
        },
        startTime: {
          lt: windowEnd, // Only consider bookings that started before window ends
        },
      },
      include: {
        recurrenceRule: true,
        exceptions: true,
      },
    });

    // Expand each recurring booking
    for (const booking of recurringBookings) {
      if (!booking.recurrenceRule) continue;

      try {
        // Convert Prisma exceptions to our format
        const exceptions = booking.exceptions.map((exc) => ({
          exceptDate: exc.exceptDate,
          replaceStart: exc.replaceStart ?? undefined,
          replaceEnd: exc.replaceEnd ?? undefined,
        }));

        // Calculate the duration of the booking to expand the search window
        // We need to search backwards by the booking duration to catch occurrences
        // that start before windowStart but overlap with it
        const duration = dayjs.utc(booking.endTime).diff(dayjs.utc(booking.startTime), 'millisecond');
        const expandedWindowStart = dayjs.utc(windowStart).subtract(duration, 'millisecond').toDate();

        // Expand occurrences for this recurring booking with expanded window
        const occurrences = expandOccurrences(
          booking.recurrenceRule.rrule,
          expandedWindowStart,
          windowEnd,
          booking.startTime,
          booking.endTime,
          exceptions
        );

        // Add expanded occurrences to instances
        for (const occurrence of occurrences) {
          // Only include occurrences that actually overlap with the original window
          if (occurrence.start < windowEnd && occurrence.end > windowStart) {
            instances.push({
              bookingId: booking.id,
              start: occurrence.start,
              end: occurrence.end,
              isRecurring: true,
            });
          }
        }
      } catch (error) {
        logger.error(
          { error, bookingId: booking.id, rrule: booking.recurrenceRule.rrule },
          'Failed to expand recurring booking'
        );
      }
    }

    // Sort instances by start time
    instances.sort((a, b) => a.start.getTime() - b.start.getTime());

    logger.debug(
      {
        resourceId,
        windowStart,
        windowEnd,
        singleBookings: singleResult.length,
        recurringBookings: recurringBookings.length,
        totalInstances: instances.length,
      },
      'Found overlapping bookings'
    );

    return instances;
  } catch (error) {
    logger.error({ error, resourceId, windowStart, windowEnd }, 'Failed to find overlaps');
    throw error;
  }
}

/**
 * Checks if a candidate time slot conflicts with existing bookings.
 * 
 * @param resourceId - UUID of the resource to check
 * @param candidateStart - Start time of the candidate slot
 * @param candidateEnd - End time of the candidate slot
 * @returns Conflict information with list of conflicting bookings
 */
export async function hasConflict(
  resourceId: string,
  candidateStart: Date,
  candidateEnd: Date
): Promise<ConflictInfo> {
  try {
    // Get all overlapping instances
    const instances = await findOverlaps(resourceId, candidateStart, candidateEnd);

    // Check if any instance overlaps with our candidate
    const conflicts = instances.filter((instance) => {
      // Two intervals overlap if: start1 < end2 AND start2 < end1
      return (
        candidateStart < instance.end &&
        instance.start < candidateEnd
      );
    });

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  } catch (error) {
    logger.error(
      { error, resourceId, candidateStart, candidateEnd },
      'Failed to check for conflicts'
    );
    throw error;
  }
}

/**
 * Checks if two time intervals overlap.
 * 
 * @param start1 - Start of first interval
 * @param end1 - End of first interval
 * @param start2 - Start of second interval
 * @param end2 - End of second interval
 * @returns true if intervals overlap
 */
export function intervalsOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean {
  return start1 < end2 && start2 < end1;
}
