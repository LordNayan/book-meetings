import { Request, Response } from 'express';
import { logger } from '../logger';
import { availabilityService } from '../services/availability.service';

export class AvailabilityController {
  /**
   * Get available time slots for a resource
   */
  async getAvailability(req: Request, res: Response): Promise<Response> {
    try {
      const query = req.query as any;

      // Compute availability
      const result = await availabilityService.computeAvailability(query);

      return res.status(200).json(result);
    } catch (error: any) {
      // Handle resource not found
      if (error.message && error.message.includes('does not exist')) {
        return res.status(404).json({
          error: 'Resource not found',
          message: error.message,
        });
      }

      logger.error({ error }, 'Error computing availability');
      return res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred while computing availability',
      });
    }
  }
}

export const availabilityController = new AvailabilityController();
