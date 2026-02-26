import type { Tables } from '@fitsync/database-types';
import { z } from 'zod';

import { userRoleSchema } from './user-role.schema';

/** Matches the public.profiles table shape.
 *  The `satisfies` assertion below keeps this Zod schema in sync with the
 *  generated DB types: adding a column to profiles + running pnpm gen:types
 *  will cause a typecheck failure here until the schema is updated. */
export const profileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().min(1).max(255),
  role: userRoleSchema,
  stripe_customer_id: z.string().nullable(),
  pending_deletion: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}) satisfies z.ZodType<Tables<'profiles'>>;

export type Profile = z.infer<typeof profileSchema>;
