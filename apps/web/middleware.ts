import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Next.js middleware — REQUIRED for Supabase session management.
 *
 * Without this file, Supabase access tokens expire after one hour and
 * Server Components receive stale sessions, silently failing auth checks.
 *
 * Why this creates its own Supabase client instead of using @fitsync/database/server:
 * The @fitsync/database/server factory is for Server Components — it reads from
 * next/headers cookies(). Middleware runs before that lifecycle and needs to
 * read request.cookies AND write to the response cookies simultaneously.
 * This double-mutation pattern requires direct @supabase/ssr usage.
 *
 * What it does:
 * 1. Reads session from request cookies.
 * 2. Refreshes the access token if expired.
 * 3. Writes updated tokens to response cookies.
 * 4. Redirects unauthenticated users away from protected routes.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env['SUPABASE_URL'];
  const supabaseAnonKey = process.env['SUPABASE_ANON_KEY'];
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in middleware');
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // Refresh session. Do not add logic between createServerClient and getUser.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup');
  const isPublicRoute = isAuthRoute || pathname.startsWith('/invite');

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    const redirect = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
    url.pathname = '/login';
    url.searchParams.set('redirect', redirect);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
};
