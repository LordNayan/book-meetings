import { Router } from 'express';
import { availabilityController } from '../controllers/availability.controller';
import { validateQuery } from '../middlewares/validation';
import { availabilityQuerySchema } from '../validators/schemas';

export const availabilityRouter = Router();

availabilityRouter.get(
  '/',
  validateQuery(availabilityQuerySchema),
  availabilityController.getAvailability.bind(availabilityController)
);
