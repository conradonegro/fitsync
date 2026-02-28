import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';

import { createServerClient } from '@fitsync/database/server';
import { userRoleSchema } from '@fitsync/shared';

import { signOut } from './actions/auth';

/**
 * Public home page.
 * Unauthenticated users are redirected to /login by middleware.ts.
 * Placeholder until the trainer dashboard is built in T7.
 *
 * Uses getTranslations (async, server API) not useTranslations (hook, client API).
 * Uses createServerClient from @fitsync/database/server to read the authenticated user.
 */
export default async function HomePage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const t = await getTranslations('common');
  const tAuth = await getTranslations('auth');
  const roles = userRoleSchema.options;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold text-gray-900">FitSync</h1>
      <p className="mt-4 text-lg text-gray-600">{t('loading')}</p>
      <p className="mt-2 text-sm text-gray-400">For {roles.join(' & ')}s</p>
      {user && <p className="mt-2 text-sm text-gray-400">{user.email}</p>}
      <form action={signOut} className="mt-4">
        <button
          type="submit"
          className="rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
        >
          {tAuth('sign_out')}
        </button>
      </form>
    </main>
  );
}
