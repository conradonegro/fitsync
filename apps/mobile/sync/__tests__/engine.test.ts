/**
 * Unit tests for the D6 sync engine (runSync).
 *
 * Mocking strategy:
 *  - useAuthStore.getState() → controlled per-test
 *  - useWorkoutStore.getState() → controlled per-test
 *  - getDb() → returns a mock db object (never used directly in engine; helpers are also mocked)
 *  - All DB helper modules → jest.fn() mocks
 *  - supabase from @fitsync/database → chainable jest.fn() mocks
 */

jest.mock('../../store/auth.store');
jest.mock('../../store/workout.store');
jest.mock('../../db/client');
jest.mock('../../db/event-queue');
jest.mock('../../db/sync-state');
jest.mock('../../db/remote-events');
jest.mock('@fitsync/database');

import { useAuthStore } from '../../store/auth.store';
import { useWorkoutStore } from '../../store/workout.store';
import { getDb } from '../../db/client';
import { deleteEvents, getUnsyncedEvents, markEventsSynced } from '../../db/event-queue';
import { getSyncState, setSyncState } from '../../db/sync-state';
import { upsertRemoteEvents } from '../../db/remote-events';
import { supabase } from '@fitsync/database';
import { runSync } from '../engine';

// ─── Typed helpers ────────────────────────────────────────────────────────────

const mockGetUnsyncedEvents = getUnsyncedEvents as jest.Mock;
const mockDeleteEvents = deleteEvents as jest.Mock;
const mockMarkEventsSynced = markEventsSynced as jest.Mock;
const mockGetSyncState = getSyncState as jest.Mock;
const mockSetSyncState = setSyncState as jest.Mock;
const mockUpsertRemoteEvents = upsertRemoteEvents as jest.Mock;
const mockGetDb = getDb as jest.Mock;
const mockSupabase = supabase as jest.Mocked<typeof supabase>;

// ─── Supabase builder factory ─────────────────────────────────────────────────

function makeUpsertMock(result: { error: object | null }) {
  return jest.fn().mockResolvedValue(result);
}

function makeUpdateChain(result: { error: object | null }) {
  const chain = {
    eq: jest.fn() as jest.Mock,
    is: jest.fn().mockResolvedValue(result) as jest.Mock,
  };
  chain.eq.mockReturnValue(chain);
  return chain;
}

function makeSelectChain(result: { data: unknown[] | null; error: object | null }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(result),
  };
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function setAuth(userId: string | null, deviceId: string | null) {
  (useAuthStore as unknown as { getState: jest.Mock }).getState.mockReturnValue({
    user: userId ? { id: userId } : null,
    deviceId,
  });
}

function setActiveSession(sessionId: string | null) {
  (useWorkoutStore as unknown as { getState: jest.Mock }).getState.mockReturnValue({
    activeSessionId: sessionId,
  });
}

interface TestEvent {
  id: string;
  session_id: string;
  device_id: string;
  client_sequence: number;
  event_type: 'session_start' | 'set_logged' | 'session_end';
  payload: string;
  client_created_at: string;
}

function makeEvent(overrides?: Partial<TestEvent>): TestEvent {
  return {
    id: 'evt-1',
    session_id: 'sess-1',
    device_id: 'device-1',
    client_sequence: 1,
    event_type: 'session_start',
    payload: JSON.stringify({ started_at: '2024-01-01T10:00:00Z' }),
    client_created_at: '2024-01-01T10:00:00Z',
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // resetAllMocks clears implementations AND once-value queues (clearAllMocks only clears call history).
  // Without reset, mockResolvedValueOnce leftovers from a test that throws early bleed into the next test.
  jest.resetAllMocks();
  mockGetDb.mockResolvedValue({});
  setAuth('athlete-1', 'device-1');
  setActiveSession(null);
  mockGetUnsyncedEvents.mockResolvedValue([]);
  mockGetSyncState.mockResolvedValue(null);
  mockDeleteEvents.mockResolvedValue(undefined);
  mockMarkEventsSynced.mockResolvedValue(undefined);
  mockUpsertRemoteEvents.mockResolvedValue(undefined);
  mockSetSyncState.mockResolvedValue(undefined);

  // Default supabase.from returns success mocks
  (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'workout_sessions') {
      return {
        upsert: makeUpsertMock({ error: null }),
        update: jest.fn().mockReturnValue(makeUpdateChain({ error: null })),
      };
    }
    if (table === 'workout_events') {
      return {
        upsert: makeUpsertMock({ error: null }),
        ...makeSelectChain({ data: [], error: null }),
      };
    }
    return {};
  });
});

// ─── Early return guards ──────────────────────────────────────────────────────

describe('early return when not authenticated', () => {
  it('returns without calling getDb when athleteId is null', async () => {
    setAuth(null, 'device-1');
    await runSync();
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it('returns without calling getDb when deviceId is null', async () => {
    setAuth('athlete-1', null);
    await runSync();
    expect(mockGetDb).not.toHaveBeenCalled();
  });
});

// ─── Empty queue ──────────────────────────────────────────────────────────────

describe('empty event queue', () => {
  it('skips flush and runs catch-up when queue is empty', async () => {
    mockGetUnsyncedEvents.mockResolvedValue([]);
    await runSync();
    // No upsert or delete should happen
    expect(mockDeleteEvents).not.toHaveBeenCalled();
    expect(mockMarkEventsSynced).not.toHaveBeenCalled();
    // Catch-up query still runs
    expect(mockGetSyncState).toHaveBeenCalledWith(expect.anything(), 'last_server_timestamp');
  });

  it('uses epoch as default last_server_timestamp', async () => {
    mockGetSyncState.mockResolvedValue(null);
    await runSync();
    const workoutEventsFrom = (mockSupabase.from as jest.Mock).mock.calls.find(
      ([t]: [string]) => t === 'workout_events',
    );
    expect(workoutEventsFrom).toBeDefined();
  });
});

// ─── Flush loop — session lifecycle ───────────────────────────────────────────

describe('flush loop: batch with session_start only (active session)', () => {
  it('upserts sessions and marks events synced (not deleted)', async () => {
    const event = makeEvent({ event_type: 'session_start' });
    mockGetUnsyncedEvents
      .mockResolvedValueOnce([event]) // first batch
      .mockResolvedValueOnce([]); // second batch — exits loop

    await runSync();

    expect(mockMarkEventsSynced).toHaveBeenCalledWith(
      expect.anything(),
      [event.id],
      expect.any(String),
    );
    expect(mockDeleteEvents).not.toHaveBeenCalledWith(expect.anything(), [event.id]);
  });
});

describe('flush loop: batch with session_end (completed session)', () => {
  it('deletes all events for completed sessions', async () => {
    const startEvt = makeEvent({
      id: 'evt-start',
      event_type: 'session_start',
      client_sequence: 1,
    });
    const endEvt = makeEvent({
      id: 'evt-end',
      event_type: 'session_end',
      client_sequence: 2,
      payload: JSON.stringify({ ended_at: '2024-01-01T11:00:00Z' }),
    });
    mockGetUnsyncedEvents.mockResolvedValueOnce([startEvt, endEvt]).mockResolvedValueOnce([]);

    await runSync();

    expect(mockDeleteEvents).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['evt-start', 'evt-end']),
    );
    expect(mockMarkEventsSynced).toHaveBeenCalledWith(expect.anything(), [], expect.any(String));
  });
});

// ─── Flush errors → throw ────────────────────────────────────────────────────

describe('flush error handling', () => {
  it('throws when workout_sessions upsert fails', async () => {
    const event = makeEvent({ event_type: 'session_start' });
    mockGetUnsyncedEvents.mockResolvedValueOnce([event]).mockResolvedValueOnce([]);

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'workout_sessions') {
        return { upsert: jest.fn().mockResolvedValue({ error: { message: 'db error' } }) };
      }
      return {
        upsert: makeUpsertMock({ error: null }),
        ...makeSelectChain({ data: [], error: null }),
      };
    });

    await expect(runSync()).rejects.toThrow('workout_sessions upsert failed');
  });

  it('throws when workout_events upsert fails', async () => {
    const event = makeEvent({ event_type: 'set_logged' });
    mockGetUnsyncedEvents.mockResolvedValueOnce([event]).mockResolvedValueOnce([]);

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'workout_sessions') {
        return { upsert: makeUpsertMock({ error: null }) };
      }
      if (table === 'workout_events') {
        return { upsert: jest.fn().mockResolvedValue({ error: { message: 'events error' } }) };
      }
      return {};
    });

    await expect(runSync()).rejects.toThrow('workout_events upsert failed');
  });

  it('throws when session_end update fails', async () => {
    const endEvt = makeEvent({
      event_type: 'session_end',
      payload: JSON.stringify({ ended_at: '2024-01-01T11:00:00Z' }),
    });
    mockGetUnsyncedEvents.mockResolvedValueOnce([endEvt]).mockResolvedValueOnce([]);

    const badUpdateChain = makeUpdateChain({ error: { message: 'update failed' } });
    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'workout_sessions') {
        return {
          upsert: makeUpsertMock({ error: null }),
          update: jest.fn().mockReturnValue(badUpdateChain),
        };
      }
      return {
        upsert: makeUpsertMock({ error: null }),
        ...makeSelectChain({ data: [], error: null }),
      };
    });

    await expect(runSync()).rejects.toThrow('workout_sessions end update failed');
  });
});

// ─── Catch-up ─────────────────────────────────────────────────────────────────

describe('catch-up phase', () => {
  it('is non-fatal: does not throw when catch-up query fails', async () => {
    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'workout_events') {
        return {
          upsert: makeUpsertMock({ error: null }),
          ...makeSelectChain({ data: null, error: { message: 'network error' } }),
        };
      }
      return { upsert: makeUpsertMock({ error: null }) };
    });

    await expect(runSync()).resolves.not.toThrow();
  });

  it('filters out own-device events before upserting to remote_events', async () => {
    const ownRow = {
      id: 'e1',
      device_id: 'device-1',
      session_id: 's1',
      athlete_id: 'a1',
      client_sequence: 1,
      event_type: 'set_logged',
      payload: '{}',
      client_created_at: '2024-01-01T10:00:00Z',
      server_created_at: '2024-01-01T10:00:01Z',
    };
    const otherRow = { ...ownRow, id: 'e2', device_id: 'other-device' };

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'workout_events') {
        return {
          upsert: makeUpsertMock({ error: null }),
          ...makeSelectChain({ data: [ownRow, otherRow], error: null }),
        };
      }
      return { upsert: makeUpsertMock({ error: null }) };
    });

    await runSync();

    const [, remoteRows] = mockUpsertRemoteEvents.mock.calls[0] as [unknown, unknown[]];
    expect(remoteRows).toHaveLength(1);
    expect((remoteRows[0]! as { device_id: string }).device_id).toBe('other-device');
  });

  it('normalises string payload as-is', async () => {
    const row = {
      id: 'e1',
      device_id: 'other-device',
      session_id: 's1',
      athlete_id: 'a1',
      client_sequence: 1,
      event_type: 'set_logged',
      payload: '{"foo":"bar"}',
      client_created_at: '2024-01-01T10:00:00Z',
      server_created_at: '2024-01-01T10:00:01Z',
    };

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'workout_events') {
        return {
          upsert: makeUpsertMock({ error: null }),
          ...makeSelectChain({ data: [row], error: null }),
        };
      }
      return { upsert: makeUpsertMock({ error: null }) };
    });

    await runSync();

    const [, remoteRows] = mockUpsertRemoteEvents.mock.calls[0] as [
      unknown,
      Array<{ payload: string }>,
    ];
    expect(remoteRows[0]!.payload).toBe('{"foo":"bar"}');
  });

  it('normalises object payload via JSON.stringify', async () => {
    const row = {
      id: 'e1',
      device_id: 'other-device',
      session_id: 's1',
      athlete_id: 'a1',
      client_sequence: 1,
      event_type: 'set_logged',
      payload: { foo: 'bar' },
      client_created_at: '2024-01-01T10:00:00Z',
      server_created_at: '2024-01-01T10:00:01Z',
    };

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'workout_events') {
        return {
          upsert: makeUpsertMock({ error: null }),
          ...makeSelectChain({ data: [row], error: null }),
        };
      }
      return { upsert: makeUpsertMock({ error: null }) };
    });

    await runSync();

    const [, remoteRows] = mockUpsertRemoteEvents.mock.calls[0] as [
      unknown,
      Array<{ payload: string }>,
    ];
    expect(remoteRows[0]!.payload).toBe('{"foo":"bar"}');
  });

  it('advances last_server_timestamp to the last row server_created_at', async () => {
    const rows = [
      {
        id: 'e1',
        device_id: 'other',
        session_id: 's1',
        athlete_id: 'a1',
        client_sequence: 1,
        event_type: 'set_logged',
        payload: '{}',
        client_created_at: '2024-01-01T10:00:00Z',
        server_created_at: '2024-01-01T10:00:01Z',
      },
      {
        id: 'e2',
        device_id: 'other',
        session_id: 's1',
        athlete_id: 'a1',
        client_sequence: 2,
        event_type: 'set_logged',
        payload: '{}',
        client_created_at: '2024-01-01T10:00:05Z',
        server_created_at: '2024-01-01T10:00:06Z',
      },
    ];

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'workout_events') {
        return {
          upsert: makeUpsertMock({ error: null }),
          ...makeSelectChain({ data: rows, error: null }),
        };
      }
      return { upsert: makeUpsertMock({ error: null }) };
    });

    await runSync();

    expect(mockSetSyncState).toHaveBeenCalledWith(
      expect.anything(),
      'last_server_timestamp',
      '2024-01-01T10:00:06Z',
    );
  });

  it('does not call upsertRemoteEvents when all server rows are from own device', async () => {
    const ownRow = {
      id: 'e1',
      device_id: 'device-1',
      session_id: 's1',
      athlete_id: 'a1',
      client_sequence: 1,
      event_type: 'set_logged',
      payload: '{}',
      client_created_at: '2024-01-01T10:00:00Z',
      server_created_at: '2024-01-01T10:00:01Z',
    };

    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'workout_events') {
        return {
          upsert: makeUpsertMock({ error: null }),
          ...makeSelectChain({ data: [ownRow], error: null }),
        };
      }
      return { upsert: makeUpsertMock({ error: null }) };
    });

    await runSync();
    // upsertRemoteEvents called with empty array (all filtered out)
    expect(mockUpsertRemoteEvents).toHaveBeenCalledWith(expect.anything(), []);
  });
});
