import type { Json } from '@fitsync/database-types';
import { supabase } from '@fitsync/database';

import { getDb } from '../db/client';
import { deleteEvents, getUnsyncedEvents, markEventsSynced } from '../db/event-queue';
import { upsertRemoteEvents } from '../db/remote-events';
import { getSyncState, setSyncState } from '../db/sync-state';
import { useAuthStore } from '../store/auth.store';
import { useWorkoutStore } from '../store/workout.store';

const BATCH_SIZE = 50;
const CATCH_UP_LIMIT = 200;

/**
 * Flushes the local SQLite event queue to Supabase, then performs a catch-up
 * query to pull any server events this device missed.
 *
 * Idempotency contract:
 *   - workout_sessions upsert uses onConflict: 'id', ignoreDuplicates: true
 *   - workout_events upsert uses onConflict: 'device_id,client_sequence', ignoreDuplicates: true
 *   - session_end update guards with .is('ended_at', null) to prevent re-firing
 *   - remote_events uses INSERT OR IGNORE
 *
 * Event lifecycle after flush:
 *   - Completed session events (batch contains session_end) → DELETE from queue
 *   - Active session events (no session_end yet) → UPDATE synced_at = now
 */
export async function runSync(): Promise<void> {
  const athleteId = useAuthStore.getState().user?.id;
  const deviceId = useAuthStore.getState().deviceId;

  if (athleteId == null || deviceId == null) {
    return; // not authenticated
  }

  const db = await getDb();

  // ── FLUSH LOOP ─────────────────────────────────────────────────────────────
  for (;;) {
    const batch = await getUnsyncedEvents(db, deviceId, BATCH_SIZE);
    if (batch.length === 0) break;

    // 1. Collect session_start events → upsert workout_sessions
    const sessionStartEvents = batch.filter((e) => e.event_type === 'session_start');
    if (sessionStartEvents.length > 0) {
      const sessions = sessionStartEvents.map((e) => {
        const payload = JSON.parse(e.payload) as { started_at: string };
        return { id: e.session_id, athlete_id: athleteId, started_at: payload.started_at };
      });
      const { error } = await supabase
        .from('workout_sessions')
        .upsert(sessions, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw new Error(`[Sync] workout_sessions upsert failed: ${error.message}`);
    }

    // 2. ALL events → upsert workout_events
    const workoutEvents = batch.map((e) => ({
      id: e.id,
      session_id: e.session_id,
      athlete_id: athleteId,
      device_id: e.device_id,
      client_sequence: e.client_sequence,
      event_type: e.event_type,
      payload: JSON.parse(e.payload) as Json,
      client_created_at: e.client_created_at,
    }));
    const { error: eventsError } = await supabase
      .from('workout_events')
      .upsert(workoutEvents, { onConflict: 'device_id,client_sequence', ignoreDuplicates: true });
    if (eventsError) throw new Error(`[Sync] workout_events upsert failed: ${eventsError.message}`);

    // 3. session_end events → update workout_sessions.ended_at
    const sessionEndEvents = batch.filter((e) => e.event_type === 'session_end');
    for (const e of sessionEndEvents) {
      const payload = JSON.parse(e.payload) as { ended_at: string };
      const { error: endError } = await supabase
        .from('workout_sessions')
        .update({ ended_at: payload.ended_at })
        .eq('id', e.session_id)
        .eq('athlete_id', athleteId)
        .is('ended_at', null); // guard: no-op on retry if already set
      if (endError)
        throw new Error(`[Sync] workout_sessions end update failed: ${endError.message}`);
    }

    // 4. Partition batch by session lifecycle
    const completedSessionIds = new Set(sessionEndEvents.map((e) => e.session_id));
    const activeSessionId = useWorkoutStore.getState().activeSessionId;

    const idsToDelete = batch.filter((e) => completedSessionIds.has(e.session_id)).map((e) => e.id);

    const idsToMark = batch.filter((e) => !completedSessionIds.has(e.session_id)).map((e) => e.id);

    const syncedAt = new Date().toISOString();
    await deleteEvents(db, idsToDelete);
    await markEventsSynced(db, idsToMark, syncedAt);

    if (__DEV__) {
      console.log(
        `[Sync] Flushed batch: ${batch.length} events. deleted=${idsToDelete.length} marked=${idsToMark.length} activeSession=${activeSessionId ?? 'none'}`,
      );
    }
  }

  // ── CATCH-UP ───────────────────────────────────────────────────────────────
  const lastTs = (await getSyncState(db, 'last_server_timestamp')) ?? '1970-01-01T00:00:00Z';

  const { data: serverRows, error: catchUpError } = await supabase
    .from('workout_events')
    .select(
      'id, session_id, athlete_id, device_id, client_sequence, event_type, payload, client_created_at, server_created_at',
    )
    .eq('athlete_id', athleteId)
    .gt('server_created_at', lastTs)
    .order('server_created_at', { ascending: true })
    .limit(CATCH_UP_LIMIT);

  if (catchUpError) {
    // Catch-up failure is non-fatal: flush already succeeded.
    if (__DEV__) console.warn('[Sync] Catch-up query failed:', catchUpError.message);
    return;
  }

  if (serverRows && serverRows.length > 0) {
    // Filter to rows from OTHER devices (this device's events are already local)
    const remoteRows = serverRows
      .filter((r) => r.device_id !== deviceId)
      .map((r) => ({
        id: r.id,
        session_id: r.session_id,
        athlete_id: r.athlete_id,
        device_id: r.device_id,
        client_sequence: r.client_sequence,
        event_type: r.event_type,
        payload: typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload),
        client_created_at: r.client_created_at,
        server_created_at: r.server_created_at,
      }));

    await upsertRemoteEvents(db, remoteRows);

    const lastRow = serverRows.at(-1);
    if (lastRow != null) {
      await setSyncState(db, 'last_server_timestamp', lastRow.server_created_at);
      if (__DEV__) {
        console.log(
          `[Sync] Catch-up: ${serverRows.length} server rows, ${remoteRows.length} from other devices. lastTs=${lastRow.server_created_at}`,
        );
      }
    }
  }
}
