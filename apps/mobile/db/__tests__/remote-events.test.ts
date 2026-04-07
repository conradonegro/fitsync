import type { RemoteEventRow } from '../remote-events';
import { upsertRemoteEvents } from '../remote-events';

function makeMockDb() {
  return {
    runAsync: jest.fn().mockResolvedValue(undefined),
  };
}

const makeRow = (id: string): RemoteEventRow => ({
  id,
  session_id: 'sess-1',
  athlete_id: 'athlete-1',
  device_id: 'other-device',
  client_sequence: 1,
  event_type: 'set_logged',
  payload: '{"exercise_name":"Squat"}',
  client_created_at: '2024-01-01T10:00:00Z',
  server_created_at: '2024-01-01T10:00:01Z',
});

describe('upsertRemoteEvents', () => {
  it('does nothing for an empty rows array', async () => {
    const db = makeMockDb();
    await upsertRemoteEvents(db as any, []);
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it('calls runAsync once for a single row', async () => {
    const db = makeMockDb();
    await upsertRemoteEvents(db as any, [makeRow('evt-1')]);
    expect(db.runAsync).toHaveBeenCalledTimes(1);
  });

  it('calls runAsync once per row for multiple rows', async () => {
    const db = makeMockDb();
    await upsertRemoteEvents(db as any, [makeRow('evt-1'), makeRow('evt-2'), makeRow('evt-3')]);
    expect(db.runAsync).toHaveBeenCalledTimes(3);
  });

  it('uses INSERT OR IGNORE (idempotent)', async () => {
    const db = makeMockDb();
    await upsertRemoteEvents(db as any, [makeRow('evt-1')]);
    const [sql] = db.runAsync.mock.calls[0] as [string];
    expect(sql).toMatch(/INSERT OR IGNORE INTO remote_events/i);
  });

  it('binds all 9 fields in the correct order', async () => {
    const db = makeMockDb();
    const row = makeRow('evt-42');
    await upsertRemoteEvents(db as any, [row]);
    const [, args] = db.runAsync.mock.calls[0] as [string, unknown[]];
    expect(args).toHaveLength(9);
    expect(args[0]).toBe(row.id);
    expect(args[1]).toBe(row.session_id);
    expect(args[2]).toBe(row.athlete_id);
    expect(args[3]).toBe(row.device_id);
    expect(args[4]).toBe(row.client_sequence);
    expect(args[5]).toBe(row.event_type);
    expect(args[6]).toBe(row.payload);
    expect(args[7]).toBe(row.client_created_at);
    expect(args[8]).toBe(row.server_created_at);
  });

  it('second call with same id does not throw (INSERT OR IGNORE)', async () => {
    const db = makeMockDb();
    // Simulate the db accepting both silently (INSERT OR IGNORE semantics)
    await expect(
      upsertRemoteEvents(db as any, [makeRow('dup'), makeRow('dup')]),
    ).resolves.not.toThrow();
  });
});
