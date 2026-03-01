'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const SUPPORTED = ['en', 'es', 'cs'];

export async function setLocale(locale: string): Promise<void> {
  if (!SUPPORTED.includes(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set('NEXT_LOCALE', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  revalidatePath('/', 'layout');
}
