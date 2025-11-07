import { PrismaClient } from '@prisma/client';
import { logger } from '../src/logger';
import dayjs from 'dayjs';

const prisma = new PrismaClient();

const seed = async () => {
  try {
    logger.info('Starting database seed...');

    // Seed resources
    const confereRoomAId = '550e8400-e29b-41d4-a716-446655440001';
    const confereRoomBId = '550e8400-e29b-41d4-a716-446655440002';
    const meetingRoom1Id = '550e8400-e29b-41d4-a716-446655440003';
    const deskBooking01Id = '550e8400-e29b-41d4-a716-446655440004';
    const deskBooking02Id = '550e8400-e29b-41d4-a716-446655440005';
    const resources = [
            { id: confereRoomAId, name: 'Conference Room A' },
            { id: confereRoomBId, name: 'Conference Room B' },
            { id: meetingRoom1Id, name: 'Meeting Room 1' },
            { id: deskBooking01Id, name: 'Desk Booking 01' },
            { id: deskBooking02Id, name: 'Desk Booking 02' },
    ];

    logger.info(`Creating ${resources.length} resources...`);
    
    for (const resource of resources) {
      await prisma.resource.upsert({
        where: { id: resource.id },
        update: {},
        create: resource,
      });
    }

    logger.info('Resources created successfully');

    // Seed sample bookings
    const now = dayjs();
    
    const bookings = [
      {
        resourceId: confereRoomAId,
        startTime: now.add(1, 'day').hour(9).minute(0).second(0).toDate(),
        endTime: now.add(1, 'day').hour(10).minute(0).second(0).toDate(),
        metadata: {
          title: 'Team Standup',
          organizer: 'john.doe@example.com',
          attendees: ['jane.smith@example.com', 'bob.wilson@example.com'],
        },
      },
      {
        resourceId: confereRoomAId,
        startTime: now.add(2, 'day').hour(14).minute(0).second(0).toDate(),
        endTime: now.add(2, 'day').hour(15).minute(30).second(0).toDate(),
        metadata: {
          title: 'Project Review',
          organizer: 'alice.johnson@example.com',
          attendees: ['team@example.com'],
        },
      },
      {
        resourceId: confereRoomBId,
        startTime: now.add(1, 'day').hour(11).minute(0).second(0).toDate(),
        endTime: now.add(1, 'day').hour(12).minute(0).second(0).toDate(),
        metadata: {
          title: 'Client Call',
          organizer: 'sales@example.com',
          isExternal: true,
        },
      },
      {
        resourceId: meetingRoom1Id,
        startTime: now.add(3, 'day').hour(10).minute(0).second(0).toDate(),
        endTime: now.add(3, 'day').hour(11).minute(0).second(0).toDate(),
        metadata: {
          title: 'Design Review',
          organizer: 'design-team@example.com',
        },
      },
      {
        resourceId: deskBooking01Id,
        startTime: now.add(1, 'day').hour(8).minute(0).second(0).toDate(),
        endTime: now.add(1, 'day').hour(17).minute(0).second(0).toDate(),
        metadata: {
          title: 'Hot Desk Booking',
          bookedBy: 'contractor@example.com',
        },
      },
    ];

    logger.info(`Creating ${bookings.length} sample bookings...`);

    for (const booking of bookings) {
      await prisma.booking.create({
        data: booking,
      });
    }

    logger.info('Sample bookings created successfully');

    // Create one recurring booking
    const recurringBooking = await prisma.booking.create({
      data: {
        resourceId: confereRoomAId,
        startTime: now.add(7, 'day').hour(15).minute(0).second(0).toDate(),
        endTime: now.add(7, 'day').hour(16).minute(0).second(0).toDate(),
        metadata: {
          title: 'Weekly Team Sync',
          organizer: 'manager@example.com',
          recurring: true,
        },
      },
    });

    // Add recurrence rule (every Monday at 3 PM)
    await prisma.recurrenceRule.create({
      data: {
        bookingId: recurringBooking.id,
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        isInfinite: false,
      },
    });

    logger.info('Recurring booking with rule created successfully');

    logger.info('Database seed completed successfully');
  } catch (error) {
    logger.error({ error }, 'Seed failed');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};

// Run seed if this file is executed directly
if (require.main === module) {
  seed()
    .then(() => {
      logger.info('Seed script complete');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Seed script failed');
      process.exit(1);
    });
}

export { seed };
