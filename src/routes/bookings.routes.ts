import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller';
import { validateBody } from '../middlewares/validation';
import { createBookingSchema } from '../validators/schemas';

export const bookingsRouter = Router();

bookingsRouter.post(
  '/',
  validateBody(createBookingSchema),
  bookingController.createBooking.bind(bookingController)
);
