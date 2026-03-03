import type { LogSetInput } from '@fitsync/shared';
import { create } from 'zustand';

import { getDb } from '../db/client';
import {
  getPendingEventCount,
  getNextSequence,
  getLoggedSetsForSession,
  insertEvent,
} from '../db/event-queue';
import { endLocalSession, getActiveLocalSession, insertLocalSession } from '../db/sessions';
import { useAuthStore } from './auth.store';

/** Generates a UUID v4. Uses crypto.randomUUID() when available (Hermes/modern
 *  engines), falls back to Math.random for older Expo Go environments. */
function generateUUID(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cryptoApi = (globalThis as any).crypto as { randomUUID?: () => string } | undefined;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface LoggedSet {
  /** Event UUID — stable key for FlatList */
  id: string;
  exerciseName: string;
  setNumber: number;
  reps: number;
  weightKg: number;
  loggedAt: string;
}

interface WorkoutState {
  activeSessionId: string | null;
  loggedSets: LoggedSet[];
  /** Defaults true; corrected by network monitor in RootLayout. */
  isOnline: boolean;
  pendingEventCount: number;

  setIsOnline: (online: boolean) => void;
  /** Called from AuthGate on SIGNED_IN / INITIAL_SESSION to restore a
   *  crash-interrupted session. */
  rehydrateFromDb: () => Promise<void>;
  startWorkout: () => Promise<void>;
  logSet: (input: LogSetInput) => Promise<void>;
  finishWorkout: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

export const useWorkoutStore = create<WorkoutState>()((set, get) => ({
  activeSessionId: null,
  loggedSets: [],
  isOnline: true,
  pendingEventCount: 0,

  setIsOnline: (online) => set({ isOnline: online }),

  rehydrateFromDb: async () => {
    const db = await getDb();
    const session = await getActiveLocalSession(db);
    if (session !== null) {
      const rows = await getLoggedSetsForSession(db, session.id);
      const loggedSets: LoggedSet[] = rows.map((row) => {
        const p = JSON.parse(row.payload) as {
          exercise_name: string;
          set_number: number;
          reps: number;
          weight_kg: number;
        };
        return {
          id: row.id,
          exerciseName: p.exercise_name,
          setNumber: p.set_number,
          reps: p.reps,
          weightKg: p.weight_kg,
          loggedAt: row.client_created_at,
        };
      });
      set({ activeSessionId: session.id, loggedSets });
      if (__DEV__)
        console.log('[WorkoutStore] Rehydrated session:', session.id, '— sets:', loggedSets.length);
    }
    await get().refreshPendingCount();
  },

  startWorkout: async () => {
    const deviceId = useAuthStore.getState().deviceId;
    if (deviceId === null) {
      throw new Error('[WorkoutStore] startWorkout called before deviceId is available');
    }

    const db = await getDb();
    const sessionId = generateUUID();
    const startedAt = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      await insertLocalSession(db, sessionId, startedAt);
      const seq = await getNextSequence(db, deviceId);
      await insertEvent(db, {
        id: generateUUID(),
        sessionId,
        deviceId,
        clientSequence: seq,
        eventType: 'session_start',
        payload: { started_at: startedAt },
        clientCreatedAt: startedAt,
      });
    });

    set({ activeSessionId: sessionId, loggedSets: [] });
    await get().refreshPendingCount();
    if (__DEV__) console.log('[WorkoutStore] Started session:', sessionId);
  },

  logSet: async (input: LogSetInput) => {
    const { activeSessionId, loggedSets } = get();
    const deviceId = useAuthStore.getState().deviceId;

    if (activeSessionId === null) {
      throw new Error('[WorkoutStore] logSet called with no active session');
    }
    if (deviceId === null) {
      throw new Error('[WorkoutStore] logSet called before deviceId is available');
    }

    const setNumber = loggedSets.filter((s) => s.exerciseName === input.exercise_name).length + 1;
    const now = new Date().toISOString();
    const eventId = generateUUID();

    const db = await getDb();
    const seq = await getNextSequence(db, deviceId);
    await insertEvent(db, {
      id: eventId,
      sessionId: activeSessionId,
      deviceId,
      clientSequence: seq,
      eventType: 'set_logged',
      payload: {
        exercise_name: input.exercise_name,
        set_number: setNumber,
        reps: input.reps,
        weight_kg: input.weight_kg,
      },
      clientCreatedAt: now,
    });

    const newSet: LoggedSet = {
      id: eventId,
      exerciseName: input.exercise_name,
      setNumber,
      reps: input.reps,
      weightKg: input.weight_kg,
      loggedAt: now,
    };
    set((state) => ({ loggedSets: [...state.loggedSets, newSet] }));
    await get().refreshPendingCount();
  },

  finishWorkout: async () => {
    const { activeSessionId } = get();
    const deviceId = useAuthStore.getState().deviceId;

    if (activeSessionId === null) {
      throw new Error('[WorkoutStore] finishWorkout called with no active session');
    }
    if (deviceId === null) {
      throw new Error('[WorkoutStore] finishWorkout called before deviceId is available');
    }

    const db = await getDb();
    const endedAt = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      const seq = await getNextSequence(db, deviceId);
      await insertEvent(db, {
        id: generateUUID(),
        sessionId: activeSessionId,
        deviceId,
        clientSequence: seq,
        eventType: 'session_end',
        payload: { ended_at: endedAt },
        clientCreatedAt: endedAt,
      });
      await endLocalSession(db, activeSessionId, endedAt);
    });

    set({ activeSessionId: null, loggedSets: [] });
    await get().refreshPendingCount();
    if (__DEV__) console.log('[WorkoutStore] Finished session:', activeSessionId);
  },

  refreshPendingCount: async () => {
    const deviceId = useAuthStore.getState().deviceId;
    if (deviceId === null) return;
    const db = await getDb();
    const count = await getPendingEventCount(db, deviceId);
    set({ pendingEventCount: count });
  },
}));
