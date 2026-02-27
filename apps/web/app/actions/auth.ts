'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { createServerClient } from '@fitsync/database/server';

export async function signOut() {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  await supabase.auth.signOut();
  redirect('/login');
}
