import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { sortBy } from 'lodash';
import { logger } from '../logger';
import { TimeSlot, AvailabilityResult } from '../types';
import { findOverlaps, intervalsOverlap } from './overlap';

// Enable UTC plugin for consistent timezone handling
dayjs.extend(utc);

/**
 * Merges overlapping time intervals into consolidated busy periods.
 * 
 * @param intervals - Array of time slots to merge
 * @returns Merged array of non-overlapping time slots
 */
function mergeIntervals(intervals: TimeSlot[]): TimeSlot[] {
  if (intervals.length === 0) return [];

  // Sort by start time
  const sorted = sortBy(intervals, (slot: TimeSlot) => slot.start.getTime());
  const merged: TimeSlot[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const lastMerged = merged[merged.length - 1];

    // Check if current interval overlaps or is adjacent to the last merged interval
    if (current.start <= lastMerged.end) {
      // Merge: extend the end time if current ends later
      lastMerged.end = new Date(Math.max(lastMerged.end.getTime(), current.end.getTime()));
    } else {
      // No overlap, add as new interval
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Computes the next available time slots for a resource.
 * Scans forward from a desired start time, checking for conflicts and suggesting alternatives.
 * 
 * @param resourceId - UUID of the resource to check
 * @param desiredStart - Desired start time
 * @param durationMinutes - Duration of the booking in minutes
 * @param searchHorizonHours - How far ahead to search (default: 720 hours = 30 days)
 * @param stepMinutes - Time increment to advance when searching (default: 15 minutes)
 * @param maxSuggestions - Maximum number of suggestions to return (default: 5)
 * @returns Available time slot suggestions
 */
export async function computeNextAvailable(
  resourceId: string,
  desiredStart: Date,
  durationMinutes: number,
  searchHorizonHours = 720,
  stepMinutes = 15,
  maxSuggestions = 5
): Promise<AvailabilityResult> {
  try {
    const suggestions: TimeSlot[] = [];
    const searchEnd = dayjs.utc(desiredStart).add(searchHorizonHours, 'hour').toDate();

    // Fetch all busy intervals within the search horizon
    const busyInstances = await findOverlaps(resourceId, desiredStart, searchEnd);

    // Convert busy instances to time slots and merge overlapping intervals
    const busySlots = busyInstances.map((instance) => ({
      start: instance.start,
      end: instance.end,
    }));

    const mergedBusySlots = mergeIntervals(busySlots);

    logger.debug(
      {
        resourceId,
        desiredStart,
        durationMinutes,
        busyInstancesCount: busyInstances.length,
        mergedBusySlotsCount: mergedBusySlots.length,
      },
      'Computing next available slots'
    );

    // Scan forward in time increments
    let currentStart = dayjs.utc(desiredStart);
    const searchEndDayjs = dayjs.utc(searchEnd);

    while (currentStart.isBefore(searchEndDayjs) && suggestions.length < maxSuggestions) {
      const candidateStart = currentStart.toDate();
      const candidateEnd = currentStart.add(durationMinutes, 'minute').toDate();

      // Check if this candidate slot conflicts with any busy slot
      let hasConflict = false;
      for (const busySlot of mergedBusySlots) {
        if (intervalsOverlap(candidateStart, candidateEnd, busySlot.start, busySlot.end)) {
          hasConflict = true;
          // Jump to the end of this busy period to optimize search
          currentStart = dayjs.utc(busySlot.end);
          break;
        }
      }

      if (!hasConflict) {
        // Found an available slot
        suggestions.push({
          start: candidateStart,
          end: candidateEnd,
        });
        // Move forward by step to find next slot
        currentStart = currentStart.add(stepMinutes, 'minute');
      }
    }

    logger.debug(
      {
        resourceId,
        desiredStart,
        suggestionsCount: suggestions.length,
        searchedUntil: currentStart.toDate(),
      },
      'Computed available slots'
    );

    return {
      suggestions,
      searchedUntil: currentStart.toDate(),
    };
  } catch (error) {
    logger.error(
      { error, resourceId, desiredStart, durationMinutes },
      'Failed to compute next available slots'
    );
    throw error;
  }
}

/**
 * Finds gaps (free periods) between busy time slots.
 * 
 * @param busySlots - Sorted array of busy time slots
 * @param windowStart - Start of the search window
 * @param windowEnd - End of the search window
 * @param minGapMinutes - Minimum gap duration in minutes (default: 0)
 * @returns Array of free time slots
 */
export function findGaps(
  busySlots: TimeSlot[],
  windowStart: Date,
  windowEnd: Date,
  minGapMinutes = 0
): TimeSlot[] {
  const gaps: TimeSlot[] = [];

  // Merge overlapping busy slots first
  const merged = mergeIntervals(busySlots);

  // Check for gap before first busy slot
  if (merged.length === 0) {
    // Entire window is free
    gaps.push({ start: windowStart, end: windowEnd });
    return gaps;
  }

  // Gap before first busy slot
  if (merged[0].start > windowStart) {
    const gapDuration = dayjs.utc(merged[0].start).diff(dayjs.utc(windowStart), 'minute');
    if (gapDuration >= minGapMinutes) {
      gaps.push({ start: windowStart, end: merged[0].start });
    }
  }

  // Gaps between busy slots
  for (let i = 0; i < merged.length - 1; i++) {
    const gapStart = merged[i].end;
    const gapEnd = merged[i + 1].start;
    const gapDuration = dayjs.utc(gapEnd).diff(dayjs.utc(gapStart), 'minute');

    if (gapDuration >= minGapMinutes) {
      gaps.push({ start: gapStart, end: gapEnd });
    }
  }

  // Gap after last busy slot
  const lastSlot = merged[merged.length - 1];
  if (lastSlot.end < windowEnd) {
    const gapDuration = dayjs.utc(windowEnd).diff(dayjs.utc(lastSlot.end), 'minute');
    if (gapDuration >= minGapMinutes) {
      gaps.push({ start: lastSlot.end, end: windowEnd });
    }
  }

  return gaps;
}
