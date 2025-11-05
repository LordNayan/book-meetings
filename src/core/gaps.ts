import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { sortBy } from 'lodash';
import { TimeSlot } from '../types';

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
