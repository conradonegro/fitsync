import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { createServerClient } from '@fitsync/database/server';

import { signOut } from './actions/auth';

/**
 * Home page — redirects trainers to their dashboard.
 * Athletes see a "use the mobile app" message.
 * Unauthenticated users are redirected to /login by middleware.ts.
 */
export default async function HomePage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'trainer') {
    redirect('/dashboard/athletes');
  }

  const tAuth = await getTranslations('auth');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold text-gray-900">FitSync</h1>
      <p className="mt-4 text-lg text-gray-600">Use the mobile app to log workouts.</p>
      <form action={signOut} className="mt-8">
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
