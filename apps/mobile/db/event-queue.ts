import type * as SQLite from 'expo-sqlite';

export interface InsertEventParams {
  id: string;
  sessionId: string;
  deviceId: string;
  clientSequence: number;
  eventType: 'session_start' | 'set_logged' | 'session_end';
  payload: Record<string, unknown>;
  clientCreatedAt: string;
}

/**
 * Returns the next client_sequence value for this device.
 * Uses MAX(client_sequence) + 1 — returns 1 if no rows exist yet.
 * Gaps are safe: the server idempotency constraint only requires uniqueness.
 */
export async function getNextSequence(
  db: SQLite.SQLiteDatabase,
  deviceId: string,
): Promise<number> {
  const row = await db.getFirstAsync<{ max_seq: number | null }>(
    'SELECT MAX(client_sequence) AS max_seq FROM event_queue WHERE device_id = ?',
    [deviceId],
  );
  return (row?.max_seq ?? 0) + 1;
}

/**
 * Inserts one event into the local event_queue.
 * payload is JSON-serialised to TEXT for SQLite storage.
 */
export async function insertEvent(
  db: SQLite.SQLiteDatabase,
  params: InsertEventParams,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO event_queue
       (id, session_id, device_id, client_sequence, event_type, payload, client_created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.id,
      params.sessionId,
      params.deviceId,
      params.clientSequence,
      params.eventType,
      JSON.stringify(params.payload),
      params.clientCreatedAt,
    ],
  );
}

export interface PersistedSetRow {
  id: string;
  payload: string;
  client_created_at: string;
}

/**
 * Returns all set_logged events for a session in insertion order.
 * Used by rehydrateFromDb to restore loggedSets after a crash.
 */
export async function getLoggedSetsForSession(
  db: SQLite.SQLiteDatabase,
  sessionId: string,
): Promise<PersistedSetRow[]> {
  return db.getAllAsync<PersistedSetRow>(
    `SELECT id, payload, client_created_at
     FROM event_queue
     WHERE session_id = ? AND event_type = 'set_logged'
     ORDER BY client_sequence ASC`,
    [sessionId],
  );
}

/**
 * Returns the count of unsynced events for this device.
 * Used by the home screen badge and the workout store pendingEventCount field.
 */
export async function getPendingEventCount(
  db: SQLite.SQLiteDatabase,
  deviceId: string,
): Promise<number> {
  const row = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM event_queue WHERE device_id = ? AND synced_at IS NULL',
    [deviceId],
  );
  return row?.cnt ?? 0;
}
