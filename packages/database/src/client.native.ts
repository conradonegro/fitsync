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
import Constants from 'expo-constants';

import type { Database } from '@fitsync/database-types';

// In React Native, env vars are injected at build time via app.config.ts
// and accessed through expo-constants at runtime (not as global constants).
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl as string | undefined;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config: supabaseUrl and supabaseAnonKey must be set in app.config.ts extra',
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
