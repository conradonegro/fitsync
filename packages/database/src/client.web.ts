/**
 * Supabase browser client.
 *
 * Used in Next.js Client Components ('use client') and anywhere
 * browser-side Supabase access is needed.
 *
 * DO NOT use in Next.js Server Components, Route Handlers, or middleware.
 * Use @fitsync/database/server for those contexts.
 *
 * DO NOT use in React Native.
 * Metro resolves client.native.ts for the mobile app automatically.
 */

import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@fitsync/database-types';

const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
      'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local',
  );
}

// createBrowserClient (from @supabase/ssr) stores the session in cookies,
// which Next.js middleware can read and refresh server-side.
// createClient (from @supabase/supabase-js) uses localStorage — invisible to middleware.
export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
