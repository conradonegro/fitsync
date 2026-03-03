import type { TablesInsert } from '@fitsync/database-types';
import { z } from 'zod';

/**
 * Input schema for starting a new workout session.
 *
 * athlete_id is excluded — it is server-assigned from the authenticated user.
 * id is client-generated (UUID v4) so it can be used immediately in the
 * event_queue as the session reference before D6 flushes to Supabase.
 */
export const startSessionSchema = z.object({
  id: z.string().uuid(),
  started_at: z.string().datetime({ offset: true }),
}) satisfies z.ZodType<Pick<TablesInsert<'workout_sessions'>, 'id' | 'started_at'>>;

export type StartSessionInput = z.infer<typeof startSessionSchema>;
