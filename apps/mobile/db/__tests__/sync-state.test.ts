import { getSyncState, setSyncState } from '../sync-state';

function makeMockDb() {
  return {
    runAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn(),
  };
}

describe('getSyncState', () => {
  it('returns null when key does not exist', async () => {
    const db = makeMockDb();
    db.getFirstAsync.mockResolvedValue(null);
    expect(await getSyncState(db as any, 'last_server_timestamp')).toBeNull();
  });

  it('returns the stored value when key exists', async () => {
    const db = makeMockDb();
    db.getFirstAsync.mockResolvedValue({ value: '2024-06-01T00:00:00Z' });
    expect(await getSyncState(db as any, 'last_server_timestamp')).toBe('2024-06-01T00:00:00Z');
  });

  it('passes the key as a query parameter', async () => {
    const db = makeMockDb();
    db.getFirstAsync.mockResolvedValue(null);
    await getSyncState(db as any, 'my_key');
    expect(db.getFirstAsync).toHaveBeenCalledWith(expect.any(String), ['my_key']);
  });

  it('uses a SELECT query on sync_state', async () => {
    const db = makeMockDb();
    db.getFirstAsync.mockResolvedValue(null);
    await getSyncState(db as any, 'k');
    const [sql] = db.getFirstAsync.mock.calls[0] as [string];
    expect(sql).toMatch(/SELECT value FROM sync_state WHERE key = \?/i);
  });
});

describe('setSyncState', () => {
  it('calls runAsync with INSERT OR REPLACE', async () => {
    const db = makeMockDb();
    await setSyncState(db as any, 'last_server_timestamp', '2024-07-01T00:00:00Z');
    expect(db.runAsync).toHaveBeenCalledTimes(1);
    const [sql, args] = db.runAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT OR REPLACE INTO sync_state \(key, value\) VALUES \(\?, \?\)/i);
    expect(args).toEqual(['last_server_timestamp', '2024-07-01T00:00:00Z']);
  });

  it('overwrites an existing value (upsert semantic)', async () => {
    const db = makeMockDb();
    await setSyncState(db as any, 'k', 'first');
    await setSyncState(db as any, 'k', 'second');
    // Both calls should succeed — REPLACE handles the conflict
    expect(db.runAsync).toHaveBeenCalledTimes(2);
    const [, args2] = db.runAsync.mock.calls[1] as [string, unknown[]];
    expect(args2).toEqual(['k', 'second']);
  });
});
