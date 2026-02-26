import { z } from 'zod';

import { userRoleSchema } from './user-role.schema';

/** Matches the public.profiles table shape. */
export const profileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().min(1).max(255),
  role: userRoleSchema,
  stripe_customer_id: z.string().nullable(),
  pending_deletion: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Profile = z.infer<typeof profileSchema>;
