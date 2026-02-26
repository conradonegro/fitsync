/**
 * RBAC helpers.
 * Pure functions — no side effects, no async, no infrastructure imports.
 */

import type { UserRole } from '../schemas/user-role.schema';

/** Returns true if the user has the trainer role. */
export const isTrainer = (role: UserRole): boolean => role === 'trainer';

/** Returns true if the user has the athlete role. */
export const isAthlete = (role: UserRole): boolean => role === 'athlete';
