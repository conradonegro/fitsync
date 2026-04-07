import type * as SQLite from 'expo-sqlite';

/**
 * Reads a value from the key-value sync_state table.
 * Returns null if the key does not exist.
 */
export async function getSyncState(db: SQLite.SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_state WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

/**
 * Upserts a value into the sync_state table.
 * Safe to call multiple times — last write wins.
 */
export async function setSyncState(
  db: SQLite.SQLiteDatabase,
  key: string,
  value: string,
): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)', [key, value]);
}
