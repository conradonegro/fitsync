import type * as SQLite from 'expo-sqlite';

/**
 * Initialises the local SQLite schema.
 *
 * Called once by getDb() immediately after openDatabaseAsync.
 * All statements are idempotent (IF NOT EXISTS) — safe on every launch.
 *
 * Design notes:
 * - WAL mode prevents read-locks during D6 sync flush.
 * - UNIQUE(device_id, client_sequence) mirrors the server idempotency
 *   constraint (ADR-015) so duplicates are caught locally before any
 *   network round-trip.
 * - synced_at partial index is designed for D6's flush query:
 *   WHERE synced_at IS NULL ORDER BY client_sequence ASC
 */
export async function initDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS local_sessions (
      id          TEXT PRIMARY KEY NOT NULL,
      started_at  TEXT NOT NULL,
      ended_at    TEXT,
      synced_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS event_queue (
      id                TEXT    PRIMARY KEY NOT NULL,
      session_id        TEXT    NOT NULL,
      device_id         TEXT    NOT NULL,
      client_sequence   INTEGER NOT NULL,
      event_type        TEXT    NOT NULL,
      payload           TEXT    NOT NULL,
      client_created_at TEXT    NOT NULL,
      synced_at         TEXT,
      UNIQUE(device_id, client_sequence)
    );

    CREATE INDEX IF NOT EXISTS event_queue_device_seq_idx
      ON event_queue (device_id, client_sequence ASC);

    CREATE INDEX IF NOT EXISTS event_queue_synced_idx
      ON event_queue (synced_at) WHERE synced_at IS NULL;

    CREATE TABLE IF NOT EXISTS sync_state (
      key   TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS remote_events (
      id                TEXT PRIMARY KEY NOT NULL,
      session_id        TEXT NOT NULL,
      athlete_id        TEXT NOT NULL,
      device_id         TEXT NOT NULL,
      client_sequence   INTEGER NOT NULL,
      event_type        TEXT NOT NULL,
      payload           TEXT NOT NULL,
      client_created_at TEXT NOT NULL,
      server_created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS remote_events_session_idx
      ON remote_events (session_id, client_sequence ASC);
  `);
}
