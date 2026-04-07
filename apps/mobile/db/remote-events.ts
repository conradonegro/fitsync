import type * as SQLite from 'expo-sqlite';

export interface RemoteEventRow {
  id: string;
  session_id: string;
  athlete_id: string;
  device_id: string;
  client_sequence: number;
  event_type: string;
  /** JSON string */
  payload: string;
  client_created_at: string;
  server_created_at: string;
}

/**
 * Inserts server-sourced events into the remote_events table.
 * INSERT OR IGNORE makes the call idempotent — safe to call on retry.
 */
export async function upsertRemoteEvents(
  db: SQLite.SQLiteDatabase,
  rows: RemoteEventRow[],
): Promise<void> {
  if (rows.length === 0) return;
  for (const row of rows) {
    await db.runAsync(
      `INSERT OR IGNORE INTO remote_events
         (id, session_id, athlete_id, device_id, client_sequence,
          event_type, payload, client_created_at, server_created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.session_id,
        row.athlete_id,
        row.device_id,
        row.client_sequence,
        row.event_type,
        row.payload,
        row.client_created_at,
        row.server_created_at,
      ],
    );
  }
}
