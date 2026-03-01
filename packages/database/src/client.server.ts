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
import type { SupabaseClient } from '@supabase/supabase-js';
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
/**
 * @supabase/ssr@0.5.2 returns SupabaseClient<Database, SchemaName, Schema> with 3
 * explicit type args. supabase-js@2.97.0 expanded SupabaseClient to 5 type params,
 * so the 3-arg instantiation misaligns — the 3rd arg (Schema) lands in the position
 * for SchemaName (a string), making TypeScript infer Schema = never for all queries.
 *
 * Annotating the return type as SupabaseClient<Database> lets TypeScript apply the
 * correct 5-param defaults (SchemaName='public', Schema=Database['public'], etc.).
 * The cast is safe: the runtime client is functionally identical.
 */
export const createServerClient = (
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): SupabaseClient<Database> => {
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
      setAll: (
        cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      ) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as unknown as ServerCookieOptions);
          });
        } catch {
          // Called from a Server Component — Next.js forbids cookie writes here.
          // Safe to ignore: middleware.ts refreshes the session before Server
          // Components render, so the updated tokens are already in the response.
        }
      },
    },
  }) as unknown as SupabaseClient<Database>;
};
