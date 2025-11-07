import request from 'supertest';
import app from '../../src/server';
import { prisma } from '../setup/testSetup';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

describe('GET /availability', () => {
  let testResourceId: string;

  beforeEach(async () => {
    // Create a fresh test resource for each test
    const resource = await prisma.resource.create({
      data: { name: `Availability Test Resource ${Date.now()}-${Math.random()}` },
    });
    testResourceId = resource.id;
  });

  afterEach(async () => {
    // Clean up after each test
    await prisma.exception.deleteMany({
      where: { booking: { resourceId: testResourceId } },
    });
    await prisma.recurrenceRule.deleteMany({
      where: { booking: { resourceId: testResourceId } },
    });
    await prisma.booking.deleteMany({
      where: { resourceId: testResourceId },
    });
    await prisma.resource.deleteMany({
      where: { id: testResourceId },
    });
  });

  it('should return all available slots when no bookings exist', async () => {
    const response = await request(app)
      .get('/availability')
      .query({
        resource_id: testResourceId,
        from: dayjs.utc('2026-01-01T00:00:00').toISOString(),
        to: dayjs.utc('2026-01-01T23:59:59').toISOString(),
      });

    expect(response.status).toBe(200);
    expect(response.body.resource_id).toBe(testResourceId);
    expect(response.body.available_slots).toHaveLength(1);
    expect(response.body.busy_slots_count).toBe(0);
  });

  it('should return gaps between bookings', async () => {
    // Create two bookings with a gap between them
    await prisma.booking.create({
      data: {
        resourceId: testResourceId,
        startTime: dayjs.utc('2026-01-05T10:00:00').toDate(),
        endTime: dayjs.utc('2026-01-05T11:00:00').toDate(),
      },
    });

    await prisma.booking.create({
      data: {
        resourceId: testResourceId,
        startTime: dayjs.utc('2026-01-05T14:00:00').toDate(),
        endTime: dayjs.utc('2026-01-05T15:00:00').toDate(),
      },
    });

    const response = await request(app)
      .get('/availability')
      .query({
        resource_id: testResourceId,
        from: dayjs.utc('2026-01-05T09:00:00').toISOString(),
        to: dayjs.utc('2026-01-05T16:00:00').toISOString(),
        slot: '60',
      });

    expect(response.status).toBe(200);
    expect(response.body.available_slots.length).toBeGreaterThan(0);
    expect(response.body.busy_slots_count).toBe(2);
  });

  it('should handle recurring bookings in availability check', async () => {
    // Create a recurring booking
    const booking = await prisma.booking.create({
      data: {
        resourceId: testResourceId,
        startTime: dayjs.utc('2026-01-06T10:00:00').toDate(),
        endTime: dayjs.utc('2026-01-06T11:00:00').toDate(),
      },
    });

    await prisma.recurrenceRule.create({
      data: {
        bookingId: booking.id,
        rrule: 'FREQ=DAILY;COUNT=5',
        isInfinite: false,
      },
    });

    const response = await request(app)
      .get('/availability')
      .query({
        resource_id: testResourceId,
        from: dayjs.utc('2026-01-06T00:00:00').toISOString(),
        to: dayjs.utc('2026-01-10T23:59:59').toISOString(),
      });

    expect(response.status).toBe(200);
    expect(response.body.busy_slots_count).toBeGreaterThan(0);
  });

  it('should return 400 for invalid query parameters', async () => {
    const response = await request(app)
      .get('/availability')
      .query({
        resource_id: 'invalid-uuid',
        from: 'invalid-date',
        to: dayjs.utc('2026-01-07T23:59:59').toISOString(),
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });

  it('should return 404 for non-existent resource', async () => {
    const response = await request(app)
      .get('/availability')
      .query({
        resource_id: '00000000-0000-0000-0000-000000000000',
        from: dayjs.utc('2026-01-08T00:00:00').toISOString(),
        to: dayjs.utc('2026-01-08T23:59:59').toISOString(),
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Resource not found');
  });

  it('should respect minimum slot duration', async () => {
    // Create bookings with small gaps
    await prisma.booking.create({
      data: {
        resourceId: testResourceId,
        startTime: dayjs.utc('2026-01-10T10:00:00').toDate(),
        endTime: dayjs.utc('2026-01-10T10:30:00').toDate(),
      },
    });

    await prisma.booking.create({
      data: {
        resourceId: testResourceId,
        startTime: dayjs.utc('2026-01-10T10:45:00').toDate(),
        endTime: dayjs.utc('2026-01-10T11:00:00').toDate(),
      },
    });

    // Request slots of minimum 60 minutes
    const response = await request(app)
      .get('/availability')
      .query({
        resource_id: testResourceId,
        from: dayjs.utc('2026-01-10T10:00:00').toISOString(),
        to: dayjs.utc('2026-01-10T12:00:00').toISOString(),
        slot: '60',
      });

    expect(response.status).toBe(200);
    // The 15-minute gap between bookings should be filtered out
    const smallGaps = response.body.available_slots.filter(
      (slot: { duration_minutes: number }) => slot.duration_minutes < 60
    );
    expect(smallGaps).toHaveLength(0);
  });
});
