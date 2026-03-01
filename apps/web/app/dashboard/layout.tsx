import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { signOut } from '../actions/auth';

import { createServerClient } from '@fitsync/database/server';

/**
 * Dashboard layout — trainers only.
 * Non-trainers are redirected to the home page.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
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

  if (profile?.role !== 'trainer') {
    redirect('/');
  }

  return (
    <div className="flex min-h-screen">
      <nav className="flex w-56 flex-col border-r border-gray-200 bg-white px-4 py-6">
        <p className="mb-6 text-lg font-bold text-gray-900">FitSync</p>
        <ul className="space-y-1">
          <li>
            <Link
              href="/dashboard/athletes"
              className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Athletes
            </Link>
          </li>
        </ul>
        <form action={signOut} className="mt-auto">
          <button
            type="submit"
            className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            Sign out
          </button>
        </form>
      </nav>
      <main className="flex-1 bg-gray-50 p-8">{children}</main>
    </div>
  );
}
