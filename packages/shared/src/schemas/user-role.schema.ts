import { z } from 'zod';

/** The two mutually exclusive roles in FitSync. */
export const userRoleSchema = z.enum(['trainer', 'athlete']);

export type UserRole = z.infer<typeof userRoleSchema>;
