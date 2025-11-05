import { RRule, rrulestr } from 'rrule';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { BookingException } from '../types';
import { logger } from '../logger';

// Enable UTC plugin for consistent timezone handling
dayjs.extend(utc);

/**
 * Expands a recurrence rule into a list of booking instances within a time window,
 * applying exceptions (skips or replacements).
 * 
 * @param rruleText - RFC 5545 RRULE string (e.g., "FREQ=WEEKLY;BYDAY=MO")
 * @param windowStart - Start of the time window to expand
 * @param windowEnd - End of the time window to expand
 * @param baseStart - Original start time of the booking
 * @param baseEnd - Original end time of the booking
 * @param exceptions - Array of exceptions (dates to skip or replace)
 * @returns Array of booking instances with start and end times
 */
export function expandOccurrences(
  rruleText: string,
  windowStart: Date,
  windowEnd: Date,
  baseStart: Date,
  baseEnd: Date,
  exceptions: BookingException[] = []
): Array<{ start: Date; end: Date }> {
  try {
    // Calculate duration from base booking
    const duration = dayjs.utc(baseEnd).diff(dayjs.utc(baseStart), 'millisecond');

    // Parse the RRULE string and set the dtstart
    let rrule: RRule;
    
    // Handle RRULE with or without DTSTART
    if (rruleText.includes('DTSTART')) {
      rrule = rrulestr(rruleText) as RRule;
    } else {
      // Create RRULE with dtstart from base booking
      rrule = rrulestr(rruleText, { dtstart: baseStart }) as RRule;
    }

    // Generate all occurrences between windowStart and windowEnd
    const occurrences = rrule.between(windowStart, windowEnd, true);

    // Build exception map for efficient lookup
    const exceptionMap = new Map<string, BookingException>();
    for (const exc of exceptions) {
      const dateKey = dayjs.utc(exc.exceptDate).format('YYYY-MM-DD');
      exceptionMap.set(dateKey, exc);
    }

    // Process occurrences and apply exceptions
    const instances: Array<{ start: Date; end: Date }> = [];

    for (const occurrence of occurrences) {
      const occurrenceDate = dayjs.utc(occurrence).format('YYYY-MM-DD');
      const exception = exceptionMap.get(occurrenceDate);

      if (exception) {
        // Check if this is a skip or replacement
        if (exception.replaceStart && exception.replaceEnd) {
          // Replace with new times
          instances.push({
            start: new Date(exception.replaceStart),
            end: new Date(exception.replaceEnd),
          });
        }
        // If no replacement, skip this occurrence
      } else {
        // Normal occurrence - calculate end time based on duration
        const start = occurrence;
        const end = dayjs.utc(start).add(duration, 'millisecond').toDate();
        instances.push({ start, end });
      }
    }

    logger.debug(
      {
        rruleText,
        windowStart,
        windowEnd,
        occurrencesCount: occurrences.length,
        instancesCount: instances.length,
        exceptionsCount: exceptions.length,
      },
      'Expanded recurrence rule'
    );

    return instances;
  } catch (error) {
    logger.error({ error, rruleText }, 'Failed to expand recurrence rule');
    throw new Error(`Invalid RRULE: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validates if an RRULE string is valid.
 * 
 * @param rruleText - RFC 5545 RRULE string to validate
 * @returns true if valid, false otherwise
 */
export function validateRRule(rruleText: string): boolean {
  try {
    rrulestr(rruleText);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates a human-readable description of an RRULE.
 * 
 * @param rruleText - RFC 5545 RRULE string
 * @returns Human-readable description (e.g., "every week on Monday")
 */
export function describeRRule(rruleText: string): string {
  try {
    const rrule = rrulestr(rruleText) as RRule;
    return rrule.toText();
  } catch (error) {
    logger.error({ error, rruleText }, 'Failed to describe RRULE');
    return 'Invalid recurrence rule';
  }
}
