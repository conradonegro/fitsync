import * as SQLite from 'expo-sqlite';

import { initDatabase } from './schema';

/**
 * Lazy singleton database handle.
 *
 * Opens fitsync.db once, initialises the schema, then caches the promise.
 * All DB operations across the app share this single connection — expo-sqlite
 * v15 is thread-safe for concurrent reads under WAL mode.
 *
 * Usage (outside React, e.g. in Zustand store actions):
 *   const db = await getDb();
 *   await db.runAsync('INSERT INTO ...', [...]);
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise === null) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('fitsync.db');
      await initDatabase(db);
      return db;
    })();
  }
  return dbPromise;
}
