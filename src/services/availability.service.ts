import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { prisma } from '../db';
import { logger } from '../logger';
import { findOverlaps } from '../core/overlap';
import { findGaps } from '../core/gaps';

dayjs.extend(utc);

export interface AvailabilityQuery {
  resource_id: string;
  from: string;
  to: string;
  slot: number;
}

export interface AvailabilityResponse {
  resource_id: string;
  resource_name: string;
  from: string;
  to: string;
  slot_duration_minutes: number;
  available_slots: Array<{
    start: string;
    end: string;
    duration_minutes: number;
  }>;
  busy_slots_count: number;
}

export class AvailabilityService {
  /**
   * Check if a resource exists and return it
   */
  async getResource(resourceId: string) {
    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
    });
    return resource;
  }

  /**
   * Compute available time slots for a resource
   */
  async computeAvailability(query: AvailabilityQuery): Promise<AvailabilityResponse> {
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

    // Get resource
    const resource = await this.getResource(resourceId);
    if (!resource) {
      throw new Error(`Resource with ID ${resourceId} does not exist`);
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

    return {
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
    };
  }
}

export const availabilityService = new AvailabilityService();
