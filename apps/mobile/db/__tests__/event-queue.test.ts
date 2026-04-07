import {
  deleteEvents,
  getPendingEventCount,
  getLoggedSetsForSession,
  getNextSequence,
  getUnsyncedEvents,
  insertEvent,
  markEventsSynced,
} from '../event-queue';

function makeMockDb() {
  return {
    runAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
  };
}

// ─── getNextSequence ─────────────────────────────────────────────────────────

describe('getNextSequence', () => {
  it('returns 1 when no events exist for device (null row)', async () => {
    const db = makeMockDb();
    db.getFirstAsync.mockResolvedValue(null);
    expect(await getNextSequence(db as any, 'device-1')).toBe(1);
  });

  it('returns 1 when max_seq is null (row exists but table empty for that device)', async () => {
    const db = makeMockDb();
    db.getFirstAsync.mockResolvedValue({ max_seq: null });
    expect(await getNextSequence(db as any, 'device-1')).toBe(1);
  });

  it('returns max + 1 when events exist', async () => {
    const db = makeMockDb();
    db.getFirstAsync.mockResolvedValue({ max_seq: 5 });
    expect(await getNextSequence(db as any, 'device-1')).toBe(6);
  });

  it('passes deviceId as query parameter', async () => {
    const db = makeMockDb();
    db.getFirstAsync.mockResolvedValue(null);
    await getNextSequence(db as any, 'my-device');
    expect(db.getFirstAsync).toHaveBeenCalledWith(expect.any(String), ['my-device']);
  });
});

// ─── insertEvent ─────────────────────────────────────────────────────────────

describe('insertEvent', () => {
  const params = {
    id: 'evt-1',
    sessionId: 'sess-1',
    deviceId: 'device-1',
    clientSequence: 3,
    eventType: 'set_logged' as const,
    payload: { exercise_name: 'Squat', reps: 5 },
    clientCreatedAt: '2024-01-01T10:00:00Z',
  };

  it('calls runAsync with INSERT and 7 bound parameters', async () => {
    const db = makeMockDb();
    await insertEvent(db as any, params);
    expect(db.runAsync).toHaveBeenCalledTimes(1);
    const [sql, args] = db.runAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO event_queue/i);
    expect(args).toHaveLength(7);
  });

  it('JSON-serialises the payload', async () => {
    const db = makeMockDb();
    await insertEvent(db as any, params);
    const [, args] = db.runAsync.mock.calls[0] as [string, unknown[]];
    // payload is the 6th parameter (index 5)
    expect(args[5]).toBe(JSON.stringify(params.payload));
  });

  it('preserves all field values in insertion order', async () => {
    const db = makeMockDb();
    await insertEvent(db as any, params);
    const [, args] = db.runAsync.mock.calls[0] as [string, unknown[]];
    expect(args[0]).toBe(params.id);
    expect(args[1]).toBe(params.sessionId);
    expect(args[2]).toBe(params.deviceId);
    expect(args[3]).toBe(params.clientSequence);
    expect(args[4]).toBe(params.eventType);
    expect(args[6]).toBe(params.clientCreatedAt);
  });
});

// ─── getLoggedSetsForSession ──────────────────────────────────────────────────

describe('getLoggedSetsForSession', () => {
  it('returns all rows from getAllAsync', async () => {
    const db = makeMockDb();
    const rows = [{ id: 'e1', payload: '{}', client_created_at: '2024-01-01T10:00:00Z' }];
    db.getAllAsync.mockResolvedValue(rows);
    const result = await getLoggedSetsForSession(db as any, 'sess-1');
    expect(result).toEqual(rows);
  });

  it('filters to set_logged events in SQL', async () => {
    const db = makeMockDb();
    db.getAllAsync.mockResolvedValue([]);
    await getLoggedSetsForSession(db as any, 'sess-1');
    const [sql] = db.getAllAsync.mock.calls[0] as [string];
    expect(sql).toMatch(/event_type = 'set_logged'/i);
    expect(sql).toMatch(/ORDER BY client_sequence ASC/i);
  });
});

// ─── getUnsyncedEvents ────────────────────────────────────────────────────────

describe('getUnsyncedEvents', () => {
  it('returns rows from getAllAsync', async () => {
    const db = makeMockDb();
    db.getAllAsync.mockResolvedValue([]);
    const result = await getUnsyncedEvents(db as any, 'device-1', 50);
    expect(result).toEqual([]);
  });

  it('passes deviceId and limit as parameters', async () => {
    const db = makeMockDb();
    db.getAllAsync.mockResolvedValue([]);
    await getUnsyncedEvents(db as any, 'device-1', 50);
    const [sql, args] = db.getAllAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/synced_at IS NULL/i);
    expect(args).toEqual(['device-1', 50]);
  });
});

// ─── deleteEvents ─────────────────────────────────────────────────────────────

describe('deleteEvents', () => {
  it('does nothing (no runAsync call) for empty ids array', async () => {
    const db = makeMockDb();
    await deleteEvents(db as any, []);
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it('calls runAsync with DELETE for a single id', async () => {
    const db = makeMockDb();
    await deleteEvents(db as any, ['id-1']);
    expect(db.runAsync).toHaveBeenCalledTimes(1);
    const [sql, args] = db.runAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/DELETE FROM event_queue WHERE id IN \(\?\)/i);
    expect(args).toEqual(['id-1']);
  });

  it('generates correct placeholder count for multiple ids', async () => {
    const db = makeMockDb();
    await deleteEvents(db as any, ['id-1', 'id-2', 'id-3']);
    const [sql, args] = db.runAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/IN \(\?,\?,\?\)/);
    expect(args).toEqual(['id-1', 'id-2', 'id-3']);
  });
});

// ─── markEventsSynced ────────────────────────────────────────────────────────

describe('markEventsSynced', () => {
  it('does nothing for empty ids array', async () => {
    const db = makeMockDb();
    await markEventsSynced(db as any, [], '2024-01-01T12:00:00Z');
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it('calls runAsync with UPDATE for one id', async () => {
    const db = makeMockDb();
    const syncedAt = '2024-01-01T12:00:00Z';
    await markEventsSynced(db as any, ['id-1'], syncedAt);
    const [sql, args] = db.runAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE event_queue SET synced_at = \? WHERE id IN \(\?\)/i);
    // syncedAt is first param, then ids
    expect(args).toEqual([syncedAt, 'id-1']);
  });

  it('includes syncedAt as first param followed by all ids', async () => {
    const db = makeMockDb();
    const syncedAt = '2024-01-01T12:00:00Z';
    await markEventsSynced(db as any, ['id-1', 'id-2'], syncedAt);
    const [sql, args] = db.runAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/IN \(\?,\?\)/);
    expect(args).toEqual([syncedAt, 'id-1', 'id-2']);
  });
});

// ─── getPendingEventCount ────────────────────────────────────────────────────

describe('getPendingEventCount', () => {
  it('returns 0 when getFirstAsync returns null', async () => {
    const db = makeMockDb();
    db.getFirstAsync.mockResolvedValue(null);
    expect(await getPendingEventCount(db as any, 'device-1')).toBe(0);
  });

  it('returns 0 when cnt is 0', async () => {
    const db = makeMockDb();
    db.getFirstAsync.mockResolvedValue({ cnt: 0 });
    expect(await getPendingEventCount(db as any, 'device-1')).toBe(0);
  });

  it('returns the count from the row', async () => {
    const db = makeMockDb();
    db.getFirstAsync.mockResolvedValue({ cnt: 7 });
    expect(await getPendingEventCount(db as any, 'device-1')).toBe(7);
  });

  it('queries only unsynced (synced_at IS NULL) events', async () => {
    const db = makeMockDb();
    db.getFirstAsync.mockResolvedValue({ cnt: 0 });
    await getPendingEventCount(db as any, 'device-1');
    const [sql] = db.getFirstAsync.mock.calls[0] as [string];
    expect(sql).toMatch(/synced_at IS NULL/i);
  });
});
