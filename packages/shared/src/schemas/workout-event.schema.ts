import { z } from 'zod';

/**
 * Payload stored in event_queue.payload for a 'set_logged' event.
 * Also the shape that D6 will write to workout_events.payload on Supabase.
 *
 * No `satisfies` against DB types — workout_events.payload is JSONB (opaque
 * blob at the generated-type level); validation is purely domain-level.
 */
export const setLoggedPayloadSchema = z.object({
  exercise_name: z.string().min(1).max(255),
  set_number: z.number().int().positive(),
  reps: z.number().int().positive(),
  weight_kg: z.number().min(0), // 0 = bodyweight exercise
});
export type SetLoggedPayload = z.infer<typeof setLoggedPayloadSchema>;

/**
 * What the UI form collects from the user.
 * set_number is computed by the store (not entered by the user).
 */
export const logSetInputSchema = z.object({
  exercise_name: z.string().min(1).max(255),
  reps: z.number().int().positive(),
  weight_kg: z.number().min(0),
});
export type LogSetInput = z.infer<typeof logSetInputSchema>;
