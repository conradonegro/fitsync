'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';

import { supabase } from '@fitsync/database';
import { Button } from '@fitsync/ui';

/**
 * Login form — extracted to a separate component so `useSearchParams` is
 * contained within a Suspense boundary (Next.js 15 requirement for static
 * page generation).
 */
function LoginForm() {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (loading) return;
    setError(null);

    // Validate email format client-side to avoid an obvious bad request.
    // Do NOT enforce password min-length — a user with a short password would
    // be permanently locked out of their account if we blocked it here.
    // Let Supabase return the actual "Invalid login credentials" error instead.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(tErrors('invalid_email'));
      return;
    }
    if (!password) {
      setError(tErrors('required'));
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    router.push(redirectTo?.startsWith('/') ? redirectTo : '/');
  }

  // next-intl requires all {variables} to be supplied at call time.
  // We pass a NUL sentinel, then split on it to inject the real <Link>.
  const [noAccountPrefix, noAccountSuffix = ''] = t('no_account', { link: '\x00' }).split('\x00');

  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{t('sign_in')}</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSignIn();
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            {t('email')}
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            {t('password')}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {error !== null && <p className="text-sm text-red-600">{error}</p>}

        {/* Hidden submit button so pressing Enter in either input submits the form */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />

        <Button
          label={t('sign_in')}
          onPress={() => {
            void handleSignIn();
          }}
          loading={loading}
          variant="primary"
        />
      </form>

      <p className="mt-4 text-sm text-gray-600">
        {noAccountPrefix}
        <Link href="/signup" className="text-blue-600 hover:underline">
          {t('sign_up')}
        </Link>
        {noAccountSuffix}
      </p>
    </div>
  );
}

/**
 * Login page — client component.
 *
 * NextIntlClientProvider in the root layout makes useTranslations work here.
 * supabase from @fitsync/database uses createBrowserClient (cookies), so
 * the session is visible to middleware after sign-in.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
