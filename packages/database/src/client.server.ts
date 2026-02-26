/**
 * Supabase server client — Next.js Server Components, Route Handlers, middleware.
 *
 * Import via: import { createServerClient } from '@fitsync/database/server'
 *
 * NEVER bundle in client-side code or mobile. This client reads/writes
 * cookies and is strictly a server-side construct.
 *
 * Requires middleware.ts to be configured in apps/web for session refresh.
 * Without middleware, sessions expire silently after 1 hour.
 */

import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import type { cookies } from 'next/headers';

import type { Database } from '@fitsync/database-types';

/**
 * Cookie options compatible with both @supabase/ssr (CookieSerializeOptions) and
 * Next.js (ResponseCookie). Used as the cast target when forwarding options to
 * cookieStore.set — both libraries use the same standard cookie fields.
 */
type ServerCookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: 'strict' | 'lax' | 'none';
  secure?: boolean;
};

/**
 * Creates a Supabase server client bound to the current request cookies.
 *
 * @param cookieStore - Result of `await cookies()` from 'next/headers'
 *
 * @example
 * ```ts
 * import { cookies } from 'next/headers';
 * import { createServerClient } from '@fitsync/database/server';
 *
 * const cookieStore = await cookies();
 * const supabase = createServerClient(cookieStore);
 * ```
 */
export const createServerClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  const supabaseUrl = process.env['SUPABASE_URL'];
  const supabaseAnonKey = process.env['SUPABASE_ANON_KEY'];

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. ' +
        'Ensure SUPABASE_URL and SUPABASE_ANON_KEY are set.',
    );
  }

  return createSupabaseServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      /**
       * setAll receives cookie entries from @supabase/ssr (typed as CookieSerializeOptions
       * from the 'cookie' package). We use Record<string, unknown> to accept the broad
       * @supabase/ssr type (satisfies contravariance), then cast to ServerCookieOptions
       * when forwarding to cookieStore.set (structurally compatible, no runtime conversion).
       */
      setAll: (cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }>) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options as unknown as ServerCookieOptions);
        });
      },
    },
  });
};
