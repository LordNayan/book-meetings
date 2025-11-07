import { hasConflict, intervalsOverlap, findOverlaps } from '../../src/core/overlap';
import { prisma } from '../setup/setupTestPrisma';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

// Enable UTC plugin for consistent timezone handling in tests
dayjs.extend(utc);

describe('Overlap Module', () => {
  // Store resource IDs to avoid conflicts
  let testResourceIds: string[] = [];

  beforeEach(async () => {
    // Clean up any remaining test data before each test
    await prisma.exception.deleteMany({});
    await prisma.recurrenceRule.deleteMany({});
    await prisma.booking.deleteMany({});
    await prisma.resource.deleteMany({
      where: {
        id: {
          in: testResourceIds
        }
      }
    });
    testResourceIds = [];
  });

  afterEach(async () => {
    // Clean up after each test
    await prisma.exception.deleteMany({});
    await prisma.recurrenceRule.deleteMany({});
    await prisma.booking.deleteMany({});
    await prisma.resource.deleteMany({
      where: {
        id: {
          in: testResourceIds
        }
      }
    });
    testResourceIds = [];
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Helper function to create unique test resources
  async function createTestResource(name: string): Promise<string> {
    const resource = await prisma.resource.create({
      data: { name: `${name}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` },
    });
    testResourceIds.push(resource.id);
    return resource.id;
  }

  describe('intervalsOverlap', () => {
    it('should detect overlapping intervals', () => {
      const start1 = dayjs.utc('2025-11-04T10:00:00').toDate();
      const end1 = dayjs.utc('2025-11-04T11:00:00').toDate();
      const start2 = dayjs.utc('2025-11-04T10:30:00').toDate();
      const end2 = dayjs.utc('2025-11-04T11:30:00').toDate();

      expect(intervalsOverlap(start1, end1, start2, end2)).toBe(true);
    });

    it('should detect non-overlapping intervals', () => {
      const start1 = dayjs.utc('2025-11-04T10:00:00').toDate();
      const end1 = dayjs.utc('2025-11-04T11:00:00').toDate();
      const start2 = dayjs.utc('2025-11-04T11:00:00').toDate();
      const end2 = dayjs.utc('2025-11-04T12:00:00').toDate();

      expect(intervalsOverlap(start1, end1, start2, end2)).toBe(false);
    });

    it('should handle adjacent intervals correctly', () => {
      const start1 = dayjs.utc('2025-11-04T10:00:00').toDate();
      const end1 = dayjs.utc('2025-11-04T11:00:00').toDate();
      const start2 = dayjs.utc('2025-11-04T11:00:00').toDate();
      const end2 = dayjs.utc('2025-11-04T12:00:00').toDate();

      expect(intervalsOverlap(start1, end1, start2, end2)).toBe(false);
    });
  });

  describe('findOverlaps', () => {
    it('should find single (non-recurring) bookings in time window', async () => {
      // Create a unique test resource
      const resourceId = await createTestResource('Test Conference Room');

      // Create a single booking
      await prisma.booking.create({
        data: {
          resourceId: resourceId,
          startTime: dayjs.utc('2025-11-04T10:00:00').toDate(),
          endTime: dayjs.utc('2025-11-04T11:00:00').toDate(),
          metadata: { title: 'Test Meeting' },
        },
      });

      // Query for overlaps
      const overlaps = await findOverlaps(
        resourceId,
        dayjs.utc('2025-11-04T09:00:00').toDate(),
        dayjs.utc('2025-11-04T12:00:00').toDate()
      );

      expect(overlaps).toHaveLength(1);
      expect(overlaps[0].isRecurring).toBe(false);
      expect(dayjs.utc(overlaps[0].start).format()).toBe(dayjs.utc('2025-11-04T10:00:00').format());
    });

    it('should find recurring bookings with expanded occurrences', async () => {
      // Create a unique test resource
      const resourceId = await createTestResource('Test Meeting Room');

      // Create a recurring booking (every Monday)
      const booking = await prisma.booking.create({
        data: {
          resourceId: resourceId,
          startTime: dayjs.utc('2025-11-03T10:00:00').toDate(), // Monday
          endTime: dayjs.utc('2025-11-03T11:00:00').toDate(),
          metadata: { title: 'Weekly Standup' },
        },
      });

      await prisma.recurrenceRule.create({
        data: {
          bookingId: booking.id,
          rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
          isInfinite: false,
        },
      });

      // Query for overlaps in November
      const overlaps = await findOverlaps(
        resourceId,
        dayjs.utc('2025-11-01T00:00:00').toDate(),
        dayjs.utc('2025-11-30T23:59:59').toDate()
      );

      // Should find 4 Monday occurrences in November (3rd, 10th, 17th, 24th)
      expect(overlaps.length).toBeGreaterThanOrEqual(4);
      expect(overlaps.every((o) => o.isRecurring)).toBe(true);
    });

    it('should handle recurring bookings with exceptions', async () => {
      // Create a unique test resource
      const resourceId = await createTestResource('Test Room with Exceptions');

      // Create a recurring booking
      const booking = await prisma.booking.create({
        data: {
          resourceId: resourceId,
          startTime: dayjs.utc('2025-11-03T10:00:00').toDate(),
          endTime: dayjs.utc('2025-11-03T11:00:00').toDate(),
        },
      });

      await prisma.recurrenceRule.create({
        data: {
          bookingId: booking.id,
          rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
          isInfinite: false,
        },
      });

      // Add an exception to skip the second occurrence (Nov 10)
      await prisma.exception.create({
        data: {
          bookingId: booking.id,
          exceptDate: dayjs.utc('2025-11-10').toDate(),
        },
      });

      // Query for overlaps
      const overlaps = await findOverlaps(
        resourceId,
        dayjs.utc('2025-11-01T00:00:00').toDate(),
        dayjs.utc('2025-11-30T23:59:59').toDate()
      );

      // Should find 3 occurrences (skipping Nov 10)
      const nov10Occurrence = overlaps.find(
        (o) => dayjs.utc(o.start).format('YYYY-MM-DD') === '2025-11-10'
      );
      expect(nov10Occurrence).toBeUndefined();
      expect(overlaps).toHaveLength(3);
    });

    it('should return empty array for resource with no bookings', async () => {
      const resourceId = await createTestResource('Empty Resource');

      const overlaps = await findOverlaps(
        resourceId,
        dayjs.utc('2025-11-01T00:00:00').toDate(),
        dayjs.utc('2025-11-30T23:59:59').toDate()
      );

      expect(overlaps).toHaveLength(0);
    });
  });

  describe('hasConflict', () => {
    it('should detect conflicts with existing bookings', async () => {
      // Create a unique test resource
      const resourceId = await createTestResource('Conflict Test Room');

      // Create an existing booking
      await prisma.booking.create({
        data: {
          resourceId: resourceId,
          startTime: dayjs.utc('2025-11-04T10:00:00').toDate(),
          endTime: dayjs.utc('2025-11-04T11:00:00').toDate(),
        },
      });

      // Check for conflict with overlapping time
      const result = await hasConflict(
        resourceId,
        dayjs.utc('2025-11-04T10:30:00').toDate(),
        dayjs.utc('2025-11-04T11:30:00').toDate()
      );

      expect(result.hasConflict).toBe(true);
      expect(result.conflicts).toHaveLength(1);
    });

    it('should return no conflict for available time slots', async () => {
      const resourceId = await createTestResource('Available Room');

      // Create a booking
      await prisma.booking.create({
        data: {
          resourceId: resourceId,
          startTime: dayjs.utc('2025-11-04T10:00:00').toDate(),
          endTime: dayjs.utc('2025-11-04T11:00:00').toDate(),
        },
      });

      // Check for conflict at a different time
      const result = await hasConflict(
        resourceId,
        dayjs.utc('2025-11-04T14:00:00').toDate(),
        dayjs.utc('2025-11-04T15:00:00').toDate()
      );

      expect(result.hasConflict).toBe(false);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should detect conflicts with recurring bookings', async () => {
      const resourceId = await createTestResource('Recurring Conflict Room');

      // Create a recurring booking (every weekday at 10 AM)
      const booking = await prisma.booking.create({
        data: {
          resourceId: resourceId,
          startTime: dayjs.utc('2025-11-03T10:00:00').toDate(),
          endTime: dayjs.utc('2025-11-03T11:00:00').toDate(),
        },
      });

      await prisma.recurrenceRule.create({
        data: {
          bookingId: booking.id,
          rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=20',
          isInfinite: false,
        },
      });

      // Check for conflict on a Tuesday at 10:30 AM
      const result = await hasConflict(
        resourceId,
        dayjs.utc('2025-11-04T10:30:00').toDate(), // Tuesday
        dayjs.utc('2025-11-04T11:30:00').toDate()
      );

      expect(result.hasConflict).toBe(true);
      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it('should allow booking adjacent time slots', async () => {
      const resourceId = await createTestResource('Adjacent Room');

      // Create a booking
      await prisma.booking.create({
        data: {
          resourceId: resourceId,
          startTime: dayjs.utc('2025-11-04T10:00:00').toDate(),
          endTime: dayjs.utc('2025-11-04T11:00:00').toDate(),
        },
      });

      // Check adjacent slot (starts when previous ends)
      const result = await hasConflict(
        resourceId,
        dayjs.utc('2025-11-04T11:00:00').toDate(),
        dayjs.utc('2025-11-04T12:00:00').toDate()
      );

      expect(result.hasConflict).toBe(false);
      expect(result.conflicts).toHaveLength(0);
    });
  });
});