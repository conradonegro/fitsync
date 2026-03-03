import type * as SQLite from 'expo-sqlite';

/** Inserts a new local session row when a workout starts. */
export async function insertLocalSession(
  db: SQLite.SQLiteDatabase,
  id: string,
  startedAt: string,
): Promise<void> {
  await db.runAsync('INSERT INTO local_sessions (id, started_at) VALUES (?, ?)', [id, startedAt]);
}

/** Sets ended_at on the local session row when the workout finishes. */
export async function endLocalSession(
  db: SQLite.SQLiteDatabase,
  id: string,
  endedAt: string,
): Promise<void> {
  await db.runAsync('UPDATE local_sessions SET ended_at = ? WHERE id = ?', [endedAt, id]);
}

/**
 * Crash-recovery query: returns the most recent session that has no ended_at.
 * Called from rehydrateFromDb() on app launch — if a session is found,
 * the workout store resumes it so the user can continue or finish.
 */
export async function getActiveLocalSession(
  db: SQLite.SQLiteDatabase,
): Promise<{ id: string; startedAt: string } | null> {
  const row = await db.getFirstAsync<{ id: string; started_at: string }>(
    `SELECT id, started_at
     FROM   local_sessions
     WHERE  ended_at IS NULL
     ORDER  BY started_at DESC
     LIMIT  1`,
  );
  if (!row) return null;
  return { id: row.id, startedAt: row.started_at };
}
