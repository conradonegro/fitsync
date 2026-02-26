/**
 * Supabase React Native client.
 *
 * Resolved automatically by Metro bundler in the Expo app.
 * Uses AsyncStorage for session persistence.
 *
 * DO NOT import this directly — Metro resolves it via the .native.ts extension.
 * DO NOT use in Next.js — use @fitsync/database or @fitsync/database/server.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@fitsync/database-types';

// In React Native, env vars are injected at build time via app.config.ts
// and accessed through expo-constants at runtime.
// This import is resolved in the mobile app which provides these globals.
declare const SUPABASE_URL: string;
declare const SUPABASE_ANON_KEY: string;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
