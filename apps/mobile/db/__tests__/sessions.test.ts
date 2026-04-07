import { endLocalSession, getActiveLocalSession, insertLocalSession } from '../sessions';

// Create a mock db object for each test — no expo-sqlite needed.
function makeMockDb() {
  return {
    runAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn(),
  };
}

describe('insertLocalSession', () => {
  it('calls runAsync with INSERT and correct params', async () => {
    const db = makeMockDb();
    await insertLocalSession(db as any, 'sess-1', '2024-01-01T00:00:00Z');
    expect(db.runAsync).toHaveBeenCalledTimes(1);
    expect(db.runAsync).toHaveBeenCalledWith(
      'INSERT INTO local_sessions (id, started_at) VALUES (?, ?)',
      ['sess-1', '2024-01-01T00:00:00Z'],
    );
  });
});

describe('endLocalSession', () => {
  it('calls runAsync with UPDATE and correct params', async () => {
    const db = makeMockDb();
    await endLocalSession(db as any, 'sess-1', '2024-01-01T01:00:00Z');
    expect(db.runAsync).toHaveBeenCalledTimes(1);
    expect(db.runAsync).toHaveBeenCalledWith(
      'UPDATE local_sessions SET ended_at = ? WHERE id = ?',
      ['2024-01-01T01:00:00Z', 'sess-1'],
    );
  });
});

describe('getActiveLocalSession', () => {
  it('returns null when no open session exists', async () => {
    const db = makeMockDb();
    db.getFirstAsync.mockResolvedValue(null);
    const result = await getActiveLocalSession(db as any);
    expect(result).toBeNull();
  });

  it('maps the db row to { id, startedAt }', async () => {
    const db = makeMockDb();
    db.getFirstAsync.mockResolvedValue({ id: 'sess-1', started_at: '2024-01-01T00:00:00Z' });
    const result = await getActiveLocalSession(db as any);
    expect(result).toEqual({ id: 'sess-1', startedAt: '2024-01-01T00:00:00Z' });
  });

  it('queries for rows where ended_at IS NULL, ordered DESC', async () => {
    const db = makeMockDb();
    db.getFirstAsync.mockResolvedValue(null);
    await getActiveLocalSession(db as any);
    const [sql] = db.getFirstAsync.mock.calls[0] as [string];
    expect(sql).toMatch(/WHERE\s+ended_at IS NULL/i);
    expect(sql).toMatch(/ORDER\s+BY started_at DESC/i);
    expect(sql).toMatch(/LIMIT\s+1/i);
  });
});
