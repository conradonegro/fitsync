/**
 * Zod schemas for FitSync domain objects.
 * Schemas are derived from and must remain consistent with
 * the generated types in @fitsync/database-types.
 *
 * Run `pnpm gen:types` after any DB schema change, then update
 * these schemas to match. The build will fail if they drift.
 */

export { inviteAthleteSchema, type InviteAthleteInput } from './invite-athlete.schema';
export { loginSchema, type LoginCredentials } from './login.schema';
export { profileSchema, type Profile } from './profile.schema';
export { signupSchema, type SignupCredentials } from './signup.schema';
export { userRoleSchema, type UserRole } from './user-role.schema';
export { startSessionSchema, type StartSessionInput } from './workout-session.schema';
export {
  logSetInputSchema,
  setLoggedPayloadSchema,
  type LogSetInput,
  type SetLoggedPayload,
} from './workout-event.schema';
