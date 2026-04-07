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

export interface UnsyncedEventRow {
  id: string;
  session_id: string;
  device_id: string;
  client_sequence: number;
  event_type: 'session_start' | 'set_logged' | 'session_end';
  payload: string;
  client_created_at: string;
}

/**
 * Returns up to `limit` unsynced events for this device, ordered by
 * client_sequence ASC. Used by the D6 flush loop.
 */
export async function getUnsyncedEvents(
  db: SQLite.SQLiteDatabase,
  deviceId: string,
  limit: number,
): Promise<UnsyncedEventRow[]> {
  return db.getAllAsync<UnsyncedEventRow>(
    `SELECT id, session_id, device_id, client_sequence, event_type, payload, client_created_at
     FROM event_queue
     WHERE device_id = ? AND synced_at IS NULL
     ORDER BY client_sequence ASC
     LIMIT ?`,
    [deviceId, limit],
  );
}

/**
 * Deletes confirmed events for completed sessions from the queue.
 * Called after flush confirms a session_end event was accepted by the server.
 */
export async function deleteEvents(db: SQLite.SQLiteDatabase, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM event_queue WHERE id IN (${placeholders})`, ids);
}

/**
 * Marks events as synced for the currently-active session.
 * These rows are kept so crash recovery (rehydrateFromDb) can still read them.
 */
export async function markEventsSynced(
  db: SQLite.SQLiteDatabase,
  ids: string[],
  syncedAt: string,
): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`UPDATE event_queue SET synced_at = ? WHERE id IN (${placeholders})`, [
    syncedAt,
    ...ids,
  ]);
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
