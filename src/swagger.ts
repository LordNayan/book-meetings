import swaggerJsdoc from 'swagger-jsdoc';
import { version } from '../package.json';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Book Meetings API',
      version,
      description: 'API for managing meeting room bookings with recurring patterns and availability checking',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error type',
            },
            message: {
              type: 'string',
              description: 'Human-readable error message',
            },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: {
                    type: 'string',
                  },
                  message: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              example: 'Validation failed',
            },
            message: {
              type: 'string',
              example: 'Invalid query parameters',
            },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: {
                    type: 'string',
                  },
                  message: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
        TimeSlot: {
          type: 'object',
          properties: {
            start: {
              type: 'string',
              format: 'date-time',
              description: 'Start time of the slot in ISO 8601 format',
              example: '2025-11-07T09:00:00.000Z',
            },
            end: {
              type: 'string',
              format: 'date-time',
              description: 'End time of the slot in ISO 8601 format',
              example: '2025-11-07T10:00:00.000Z',
            },
            duration_minutes: {
              type: 'integer',
              description: 'Duration of the slot in minutes',
              example: 60,
            },
          },
          required: ['start', 'end', 'duration_minutes'],
        },
        AvailabilityResponse: {
          type: 'object',
          properties: {
            resource_id: {
              type: 'string',
              format: 'uuid',
              description: 'UUID of the resource',
              example: '550e8400-e29b-41d4-a716-446655440001',
            },
            resource_name: {
              type: 'string',
              description: 'Name of the resource',
              example: 'Conference Room A',
            },
            from: {
              type: 'string',
              format: 'date-time',
              description: 'Start of the query window',
              example: '2025-11-07T00:00:00.000Z',
            },
            to: {
              type: 'string',
              format: 'date-time',
              description: 'End of the query window',
              example: '2025-11-08T00:00:00.000Z',
            },
            slot_duration_minutes: {
              type: 'integer',
              description: 'Minimum slot duration in minutes',
              example: 30,
            },
            available_slots: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/TimeSlot',
              },
            },
            busy_slots_count: {
              type: 'integer',
              description: 'Number of busy time slots found',
              example: 5,
            },
          },
        },
        Exception: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              format: 'date',
              description: 'Date to exclude or modify (YYYY-MM-DD)',
              example: '2025-11-15',
            },
            replace_start: {
              type: 'string',
              format: 'date-time',
              description: 'Optional replacement start time',
              example: '2025-11-15T14:00:00.000Z',
            },
            replace_end: {
              type: 'string',
              format: 'date-time',
              description: 'Optional replacement end time',
              example: '2025-11-15T15:00:00.000Z',
            },
          },
          required: ['date'],
        },
        BookingRequest: {
          type: 'object',
          properties: {
            resource_id: {
              type: 'string',
              format: 'uuid',
              description: 'UUID of the resource to book',
              example: '550e8400-e29b-41d4-a716-446655440001',
            },
            start_time: {
              type: 'string',
              format: 'date-time',
              description: 'Start time of the booking in ISO 8601 format',
              example: '2025-11-07T09:00:00.000Z',
            },
            end_time: {
              type: 'string',
              format: 'date-time',
              description: 'End time of the booking in ISO 8601 format',
              example: '2025-11-07T10:00:00.000Z',
            },
            metadata: {
              type: 'object',
              description: 'Optional metadata (JSON object)',
              example: { title: 'Team Standup', attendees: 5 },
            },
            recurrence_rule: {
              type: 'string',
              description: 'Optional RFC 5545 RRULE string for recurring bookings',
              example: 'FREQ=DAILY;COUNT=5',
            },
            exceptions: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Exception',
              },
              description: 'Optional array of exceptions for recurring bookings',
            },
          },
          required: ['resource_id', 'start_time', 'end_time'],
        },
        Booking: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'UUID of the booking',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            resource_id: {
              type: 'string',
              format: 'uuid',
              description: 'UUID of the resource',
              example: '550e8400-e29b-41d4-a716-446655440001',
            },
            start_time: {
              type: 'string',
              format: 'date-time',
              description: 'Start time of the booking',
              example: '2025-11-07T09:00:00.000Z',
            },
            end_time: {
              type: 'string',
              format: 'date-time',
              description: 'End time of the booking',
              example: '2025-11-07T10:00:00.000Z',
            },
            metadata: {
              type: 'object',
              description: 'Metadata associated with the booking',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Timestamp when the booking was created',
              example: '2025-11-07T08:00:00.000Z',
            },
            is_recurring: {
              type: 'boolean',
              description: 'Whether this is a recurring booking',
              example: false,
            },
            recurrence_rule: {
              type: 'string',
              description: 'RRULE string if recurring',
              example: 'FREQ=DAILY;COUNT=5',
            },
            exceptions: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Exception',
              },
            },
          },
        },
        BookingSuccessResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'success',
            },
            booking: {
              $ref: '#/components/schemas/Booking',
            },
          },
        },
        ConflictResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'conflict',
            },
            message: {
              type: 'string',
              example: 'The requested time slot conflicts with existing bookings',
            },
            conflicts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  booking_id: {
                    type: 'string',
                    format: 'uuid',
                    description: 'ID of the conflicting booking',
                  },
                  start: {
                    type: 'string',
                    format: 'date-time',
                    description: 'Start time of the conflicting booking',
                  },
                  end: {
                    type: 'string',
                    format: 'date-time',
                    description: 'End time of the conflicting booking',
                  },
                  is_recurring: {
                    type: 'boolean',
                    description: 'Whether the conflicting booking is recurring',
                  },
                  occurrence_start: {
                    type: 'string',
                    format: 'date-time',
                    description: 'Start time of the occurrence (only for recurring bookings)',
                  },
                  occurrence_end: {
                    type: 'string',
                    format: 'date-time',
                    description: 'End time of the occurrence (only for recurring bookings)',
                  },
                },
              },
            },
            next_available: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  start: {
                    type: 'string',
                    format: 'date-time',
                    description: 'Start time of available slot',
                  },
                  end: {
                    type: 'string',
                    format: 'date-time',
                    description: 'End time of available slot',
                  },
                },
              },
              description: 'Suggested alternative time slots',
            },
          },
        },
      },
    },
  },
  apis: ['./src/api/*.ts', './src/server.ts'], // Path to the API routes and server for health endpoint
};

export const swaggerSpec = swaggerJsdoc(options);
