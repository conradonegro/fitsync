import { z } from 'zod';

import { loginSchema } from './login.schema';
import { userRoleSchema } from './user-role.schema';

export const signupSchema = loginSchema.extend({
  full_name: z.string().min(1).max(255),
  role: userRoleSchema,
});

export type SignupCredentials = z.infer<typeof signupSchema>;
