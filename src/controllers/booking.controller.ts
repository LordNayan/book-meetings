import { Request, Response } from 'express';
import { logger } from '../logger';
import { bookingService } from '../services/booking.service';

export class BookingController {
  /**
   * Create a new booking (single or recurring)
   */
  async createBooking(req: Request, res: Response): Promise<Response> {
    try {
      const input = req.body;

      // Verify resource exists
      const resourceExists = await bookingService.verifyResource(input.resource_id);
      if (!resourceExists) {
        return res.status(404).json({
          error: 'Resource not found',
          message: `Resource with ID ${input.resource_id} does not exist`,
        });
      }

      // Create booking
      const result = await bookingService.createBooking(input);

      if (result.status === 'conflict') {
        return res.status(409).json({
          status: result.status,
          message: result.message,
          conflicts: result.conflicts,
          next_available: result.next_available,
        });
      }

      return res.status(201).json({
        status: result.status,
        booking: result.booking,
      });
    } catch (error: any) {
      // Handle validation errors (e.g., invalid RRULE)
      if (error.message && error.message.includes('Invalid recurrence rule')) {
        return res.status(400).json({
          error: 'Invalid recurrence rule',
          message: error.message,
        });
      }

      logger.error({ error }, 'Error creating booking');
      return res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred while creating the booking',
      });
    }
  }
}

export const bookingController = new BookingController();
