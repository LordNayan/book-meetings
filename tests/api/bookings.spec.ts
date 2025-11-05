import request from 'supertest';
import app from '../../src/server';
import { prisma } from '../setup/testSetup';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

describe('POST /bookings', () => {
  let testResourceId: string;

  beforeEach(async () => {
    // Create a fresh test resource for each test
    const resource = await prisma.resource.create({
      data: { name: `Test Resource ${Date.now()}-${Math.random()}` },
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

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Single bookings', () => {
    it('should create a single booking when no conflicts exist', async () => {
      const response = await request(app)
        .post('/bookings')
        .send({
          resource_id: testResourceId,
          start_time: dayjs.utc('2025-12-01T10:00:00').toISOString(),
          end_time: dayjs.utc('2025-12-01T11:00:00').toISOString(),
          metadata: { title: 'Test Meeting' },
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.booking).toHaveProperty('id');
      expect(response.body.booking.is_recurring).toBe(false);
    });

    it('should return 409 when booking conflicts with existing booking', async () => {
      // Create initial booking
      const firstBooking = await request(app)
        .post('/bookings')
        .send({
          resource_id: testResourceId,
          start_time: dayjs.utc('2025-12-02T10:00:00').toISOString(),
          end_time: dayjs.utc('2025-12-02T11:00:00').toISOString(),
        });

      // Ensure first booking was created successfully
      expect(firstBooking.status).toBe(201);
      expect(firstBooking.body.booking).toHaveProperty('id');

      // Try to create conflicting booking
      const response = await request(app)
        .post('/bookings')
        .send({
          resource_id: testResourceId,
          start_time: dayjs.utc('2025-12-02T10:30:00').toISOString(),
          end_time: dayjs.utc('2025-12-02T11:30:00').toISOString(),
        });

      expect(response.status).toBe(409);
      expect(response.body.status).toBe('conflict');
      expect(response.body.conflicts).toBeDefined();
      expect(response.body.next_available).toBeDefined();
    });

    it('should return 400 for invalid request data', async () => {
      const response = await request(app)
        .post('/bookings')
        .send({
          resource_id: 'invalid-uuid',
          start_time: 'invalid-date',
          end_time: dayjs.utc('2025-12-03T11:00:00').toISOString(),
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 404 for non-existent resource', async () => {
      const response = await request(app)
        .post('/bookings')
        .send({
          resource_id: '00000000-0000-0000-0000-000000000000',
          start_time: dayjs.utc('2025-12-04T10:00:00').toISOString(),
          end_time: dayjs.utc('2025-12-04T11:00:00').toISOString(),
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Resource not found');
    });
  });

  describe('Recurring bookings', () => {
    it('should create a recurring booking when no conflicts exist', async () => {
      const response = await request(app)
        .post('/bookings')
        .send({
          resource_id: testResourceId,
          start_time: dayjs.utc('2025-12-08T14:00:00').toISOString(),
          end_time: dayjs.utc('2025-12-08T15:00:00').toISOString(),
          recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
          metadata: { title: 'Weekly Team Standup' },
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.booking.is_recurring).toBe(true);
      expect(response.body.booking.recurrence_rule).toBe('FREQ=WEEKLY;BYDAY=MO;COUNT=4');
    });

    it('should return 409 when recurring booking has conflicts', async () => {
      // Create a blocking booking
      await request(app)
        .post('/bookings')
        .send({
          resource_id: testResourceId,
          start_time: dayjs.utc('2025-12-09T16:00:00').toISOString(),
          end_time: dayjs.utc('2025-12-09T17:00:00').toISOString(),
        });

      // Try to create recurring booking that conflicts
      const response = await request(app)
        .post('/bookings')
        .send({
          resource_id: testResourceId,
          start_time: dayjs.utc('2025-12-09T16:30:00').toISOString(),
          end_time: dayjs.utc('2025-12-09T17:30:00').toISOString(),
          recurrence_rule: 'FREQ=WEEKLY;BYDAY=TU;COUNT=3',
        });

      expect(response.status).toBe(409);
      expect(response.body.status).toBe('conflict');
      expect(response.body.conflicting_occurrences).toBeDefined();
    });

    it('should return 400 for invalid RRULE', async () => {
      const response = await request(app)
        .post('/bookings')
        .send({
          resource_id: testResourceId,
          start_time: dayjs.utc('2025-12-10T10:00:00').toISOString(),
          end_time: dayjs.utc('2025-12-10T11:00:00').toISOString(),
          recurrence_rule: 'INVALID_RRULE',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid recurrence rule');
    });
  });
});
