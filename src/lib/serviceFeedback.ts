import { z } from 'zod';

export const serviceFeedbackInput = z.object({
  rating: z.number().int().min(1, 'Choose at least one star.').max(5),
  comment: z.string().trim().min(20, 'Please write at least 20 characters.').max(1500, 'Feedback cannot exceed 1,500 characters.'),
  publish: z.boolean(),
}).strict();

export type PublicServiceReview = { rating: number; comment: string; createdAt: string };
