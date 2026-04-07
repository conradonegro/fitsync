/**
 * Unit tests for useWorkoutStore.
 *
 * All DB helpers, getDb, runSync, and useAuthStore are mocked so tests
 * run without SQLite or Supabase.
 */

jest.mock('../../db/client');
jest.mock('../../db/sessions');
jest.mock('../../db/event-queue');
jest.mock('../../sync/engine');
jest.mock('../auth.store');

import { getDb } from '../../db/client';
import { endLocalSession, getActiveLocalSession, insertLocalSession } from '../../db/sessions';
import {
  getLoggedSetsForSession,
  getNextSequence,
  getPendingEventCount,
  insertEvent,
} from '../../db/event-queue';
import { runSync } from '../../sync/engine';
import { useAuthStore } from '../auth.store';
import { useWorkoutStore } from '../workout.store';

// ─── Typed helpers ────────────────────────────────────────────────────────────

const mockGetDb = getDb as jest.Mock;
const mockGetActiveLocalSession = getActiveLocalSession as jest.Mock;
const mockGetLoggedSetsForSession = getLoggedSetsForSession as jest.Mock;
const mockGetNextSequence = getNextSequence as jest.Mock;
const mockInsertEvent = insertEvent as jest.Mock;
const mockInsertLocalSession = insertLocalSession as jest.Mock;
const mockEndLocalSession = endLocalSession as jest.Mock;
const mockGetPendingEventCount = getPendingEventCount as jest.Mock;
const mockRunSync = runSync as jest.Mock;

function setDeviceId(id: string | null) {
  (useAuthStore as unknown as { getState: jest.Mock }).getState.mockReturnValue({ deviceId: id });
}

// Mock db returned by getDb
const mockDb = {
  withTransactionAsync: jest.fn().mockImplementation(async (cb: () => Promise<void>) => cb()),
};

// ─── Reset before every test ──────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // Reset store to initial state
  useWorkoutStore.setState({
    activeSessionId: null,
    loggedSets: [],
    isOnline: true,
    pendingEventCount: 0,
    syncStatus: 'idle',
    lastSyncedAt: null,
  });

  mockGetDb.mockResolvedValue(mockDb);
  setDeviceId('device-1');
  mockGetNextSequence.mockResolvedValue(1);
  mockInsertEvent.mockResolvedValue(undefined);
  mockInsertLocalSession.mockResolvedValue(undefined);
  mockEndLocalSession.mockResolvedValue(undefined);
  mockGetPendingEventCount.mockResolvedValue(0);
  mockGetActiveLocalSession.mockResolvedValue(null);
  mockGetLoggedSetsForSession.mockResolvedValue([]);
  mockRunSync.mockResolvedValue(undefined);
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts with no active session', () => {
    expect(useWorkoutStore.getState().activeSessionId).toBeNull();
  });

  it('starts with empty loggedSets', () => {
    expect(useWorkoutStore.getState().loggedSets).toEqual([]);
  });

  it('starts online', () => {
    expect(useWorkoutStore.getState().isOnline).toBe(true);
  });

  it('starts with syncStatus idle', () => {
    expect(useWorkoutStore.getState().syncStatus).toBe('idle');
  });
});

// ─── setIsOnline ──────────────────────────────────────────────────────────────

describe('setIsOnline', () => {
  it('sets isOnline to false', () => {
    useWorkoutStore.getState().setIsOnline(false);
    expect(useWorkoutStore.getState().isOnline).toBe(false);
  });

  it('does NOT trigger performSync when going offline', () => {
    useWorkoutStore.setState({ isOnline: true });
    useWorkoutStore.getState().setIsOnline(false);
    expect(mockRunSync).not.toHaveBeenCalled();
  });

  it('does NOT trigger performSync when already online and setIsOnline(true) is called', () => {
    useWorkoutStore.setState({ isOnline: true });
    useWorkoutStore.getState().setIsOnline(true);
    expect(mockRunSync).not.toHaveBeenCalled();
  });

  it('triggers performSync on offline → online transition', async () => {
    useWorkoutStore.setState({ isOnline: false });
    useWorkoutStore.getState().setIsOnline(true);
    // Allow microtasks to flush
    await Promise.resolve();
    expect(mockRunSync).toHaveBeenCalledTimes(1);
  });
});

// ─── startWorkout ────────────────────────────────────────────────────────────

describe('startWorkout', () => {
  it('throws when deviceId is null', async () => {
    setDeviceId(null);
    await expect(useWorkoutStore.getState().startWorkout()).rejects.toThrow(
      'startWorkout called before deviceId',
    );
  });

  it('sets activeSessionId after success', async () => {
    await useWorkoutStore.getState().startWorkout();
    expect(useWorkoutStore.getState().activeSessionId).not.toBeNull();
  });

  it('clears loggedSets on start', async () => {
    useWorkoutStore.setState({
      loggedSets: [
        { id: 'x', exerciseName: 'Squat', setNumber: 1, reps: 5, weightKg: 100, loggedAt: '' },
      ],
    });
    await useWorkoutStore.getState().startWorkout();
    expect(useWorkoutStore.getState().loggedSets).toEqual([]);
  });

  it('inserts session_start event via transaction', async () => {
    await useWorkoutStore.getState().startWorkout();
    expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(mockInsertEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ eventType: 'session_start' }),
    );
  });
});

// ─── logSet ──────────────────────────────────────────────────────────────────

describe('logSet', () => {
  const input = { exercise_name: 'Squat', reps: 5, weight_kg: 100 };

  it('throws when no active session', async () => {
    useWorkoutStore.setState({ activeSessionId: null });
    await expect(useWorkoutStore.getState().logSet(input)).rejects.toThrow(
      'logSet called with no active session',
    );
  });

  it('throws when deviceId is null', async () => {
    useWorkoutStore.setState({ activeSessionId: 'sess-1' });
    setDeviceId(null);
    await expect(useWorkoutStore.getState().logSet(input)).rejects.toThrow(
      'logSet called before deviceId',
    );
  });

  it('appends a LoggedSet with setNumber=1 for first set of exercise', async () => {
    useWorkoutStore.setState({ activeSessionId: 'sess-1', loggedSets: [] });
    await useWorkoutStore.getState().logSet(input);
    const sets = useWorkoutStore.getState().loggedSets;
    expect(sets).toHaveLength(1);
    expect(sets[0]!.setNumber).toBe(1);
    expect(sets[0]!.exerciseName).toBe('Squat');
  });

  it('assigns setNumber=2 for second set of same exercise', async () => {
    useWorkoutStore.setState({
      activeSessionId: 'sess-1',
      loggedSets: [
        { id: 'e1', exerciseName: 'Squat', setNumber: 1, reps: 5, weightKg: 100, loggedAt: '' },
      ],
    });
    await useWorkoutStore.getState().logSet(input);
    const sets = useWorkoutStore.getState().loggedSets;
    expect(sets[1]!.setNumber).toBe(2);
  });

  it('assigns setNumber=1 for a different exercise', async () => {
    useWorkoutStore.setState({
      activeSessionId: 'sess-1',
      loggedSets: [
        { id: 'e1', exerciseName: 'Squat', setNumber: 1, reps: 5, weightKg: 100, loggedAt: '' },
      ],
    });
    await useWorkoutStore.getState().logSet({ ...input, exercise_name: 'Bench Press' });
    const sets = useWorkoutStore.getState().loggedSets;
    expect(sets[1]!.setNumber).toBe(1);
    expect(sets[1]!.exerciseName).toBe('Bench Press');
  });

  it('inserts a set_logged event', async () => {
    useWorkoutStore.setState({ activeSessionId: 'sess-1', loggedSets: [] });
    await useWorkoutStore.getState().logSet(input);
    expect(mockInsertEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ eventType: 'set_logged' }),
    );
  });
});

// ─── finishWorkout ────────────────────────────────────────────────────────────

describe('finishWorkout', () => {
  it('throws when no active session', async () => {
    useWorkoutStore.setState({ activeSessionId: null });
    await expect(useWorkoutStore.getState().finishWorkout()).rejects.toThrow(
      'finishWorkout called with no active session',
    );
  });

  it('throws when deviceId is null', async () => {
    useWorkoutStore.setState({ activeSessionId: 'sess-1' });
    setDeviceId(null);
    await expect(useWorkoutStore.getState().finishWorkout()).rejects.toThrow(
      'finishWorkout called before deviceId',
    );
  });

  it('clears activeSessionId and loggedSets after success', async () => {
    useWorkoutStore.setState({
      activeSessionId: 'sess-1',
      loggedSets: [
        { id: 'e1', exerciseName: 'Squat', setNumber: 1, reps: 5, weightKg: 100, loggedAt: '' },
      ],
    });
    await useWorkoutStore.getState().finishWorkout();
    expect(useWorkoutStore.getState().activeSessionId).toBeNull();
    expect(useWorkoutStore.getState().loggedSets).toEqual([]);
  });

  it('inserts session_end event and ends local session via transaction', async () => {
    useWorkoutStore.setState({ activeSessionId: 'sess-1', loggedSets: [] });
    await useWorkoutStore.getState().finishWorkout();
    expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(mockInsertEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ eventType: 'session_end' }),
    );
    expect(mockEndLocalSession).toHaveBeenCalledWith(mockDb, 'sess-1', expect.any(String));
  });
});

// ─── performSync ─────────────────────────────────────────────────────────────

describe('performSync', () => {
  it('returns early (no runSync call) when already syncing', async () => {
    useWorkoutStore.setState({ syncStatus: 'syncing' });
    await useWorkoutStore.getState().performSync();
    expect(mockRunSync).not.toHaveBeenCalled();
  });

  it('sets syncStatus to "syncing" before calling runSync', async () => {
    let captured = '';
    mockRunSync.mockImplementation(async () => {
      captured = useWorkoutStore.getState().syncStatus;
    });
    await useWorkoutStore.getState().performSync();
    expect(captured).toBe('syncing');
  });

  it('sets syncStatus to "idle" and updates lastSyncedAt on success', async () => {
    await useWorkoutStore.getState().performSync();
    expect(useWorkoutStore.getState().syncStatus).toBe('idle');
    expect(useWorkoutStore.getState().lastSyncedAt).not.toBeNull();
  });

  it('sets syncStatus to "error" when runSync throws', async () => {
    mockRunSync.mockRejectedValue(new Error('network error'));
    await useWorkoutStore.getState().performSync();
    expect(useWorkoutStore.getState().syncStatus).toBe('error');
    expect(useWorkoutStore.getState().lastSyncedAt).toBeNull();
  });
});

// ─── rehydrateFromDb ──────────────────────────────────────────────────────────

describe('rehydrateFromDb', () => {
  it('only calls refreshPendingCount when no active session exists', async () => {
    mockGetActiveLocalSession.mockResolvedValue(null);
    await useWorkoutStore.getState().rehydrateFromDb();
    expect(useWorkoutStore.getState().activeSessionId).toBeNull();
    expect(mockGetPendingEventCount).toHaveBeenCalled();
  });

  it('restores activeSessionId from the open session', async () => {
    mockGetActiveLocalSession.mockResolvedValue({
      id: 'sess-recovered',
      startedAt: '2024-01-01T10:00:00Z',
    });
    await useWorkoutStore.getState().rehydrateFromDb();
    expect(useWorkoutStore.getState().activeSessionId).toBe('sess-recovered');
  });

  it('reconstructs loggedSets from persisted set_logged events', async () => {
    const payload = JSON.stringify({
      exercise_name: 'Deadlift',
      set_number: 1,
      reps: 3,
      weight_kg: 120,
    });
    mockGetActiveLocalSession.mockResolvedValue({ id: 'sess-1', startedAt: '' });
    mockGetLoggedSetsForSession.mockResolvedValue([
      { id: 'evt-1', payload, client_created_at: '2024-01-01T10:00:00Z' },
    ]);

    await useWorkoutStore.getState().rehydrateFromDb();

    const sets = useWorkoutStore.getState().loggedSets;
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({
      exerciseName: 'Deadlift',
      setNumber: 1,
      reps: 3,
      weightKg: 120,
    });
  });

  it('triggers performSync when online and pending events exist', async () => {
    mockGetActiveLocalSession.mockResolvedValue(null);
    mockGetPendingEventCount.mockResolvedValue(3);
    useWorkoutStore.setState({ isOnline: true });
    await useWorkoutStore.getState().rehydrateFromDb();
    await Promise.resolve(); // flush microtasks
    expect(mockRunSync).toHaveBeenCalled();
  });

  it('does NOT trigger performSync when offline', async () => {
    mockGetActiveLocalSession.mockResolvedValue(null);
    mockGetPendingEventCount.mockResolvedValue(3);
    useWorkoutStore.setState({ isOnline: false });
    await useWorkoutStore.getState().rehydrateFromDb();
    expect(mockRunSync).not.toHaveBeenCalled();
  });
});

// ─── refreshPendingCount ──────────────────────────────────────────────────────

describe('refreshPendingCount', () => {
  it('skips db call when deviceId is null', async () => {
    setDeviceId(null);
    await useWorkoutStore.getState().refreshPendingCount();
    expect(mockGetPendingEventCount).not.toHaveBeenCalled();
  });

  it('updates pendingEventCount from db', async () => {
    mockGetPendingEventCount.mockResolvedValue(5);
    await useWorkoutStore.getState().refreshPendingCount();
    expect(useWorkoutStore.getState().pendingEventCount).toBe(5);
  });
});
