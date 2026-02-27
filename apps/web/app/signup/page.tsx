'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { supabase } from '@fitsync/database';
import { signupSchema, type UserRole } from '@fitsync/shared';
import { Button } from '@fitsync/ui';

/**
 * Signup page — client component.
 *
 * Calls supabase.auth.signUp with full_name and role stored in user_metadata.
 * The handle_new_user() DB trigger reads these to populate public.profiles.
 */
export default function SignupPage() {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('athlete');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    setError(null);

    const result = signupSchema.safeParse({ full_name: fullName, email, password, role });
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      if (firstIssue?.path[0] === 'email') {
        setError(tErrors('invalid_email'));
      } else if (firstIssue?.path[0] === 'password') {
        setError(tErrors('password_too_short'));
      } else {
        setError(tErrors('required'));
      }
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signUp({
      email: result.data.email,
      password: result.data.password,
      options: {
        data: {
          full_name: result.data.full_name,
          role: result.data.role,
        },
      },
    });
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    router.push('/');
  }

  // next-intl requires all {variables} to be supplied at call time.
  // We pass a NUL sentinel, then split on it to inject the real <Link>.
  const [alreadyHavePrefix, alreadyHaveSuffix = ''] = t('already_have_account', {
    link: '\x00',
  }).split('\x00');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">{t('sign_up')}</h1>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSignUp();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="full_name" className="block text-sm font-medium text-gray-700">
              {t('full_name')}
            </label>
            <input
              id="full_name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

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
              autoComplete="new-password"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <p className="block text-sm font-medium text-gray-700">{t('role_label')}</p>
            <div className="mt-2 flex gap-3">
              {(['trainer', 'athlete'] as const).map((r) => (
                <label
                  key={r}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    role === r
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                    className="sr-only"
                  />
                  {t(r === 'trainer' ? 'role_trainer' : 'role_athlete')}
                </label>
              ))}
            </div>
          </div>

          {error !== null && <p className="text-sm text-red-600">{error}</p>}

          {/* Hidden submit button so pressing Enter in any input submits the form */}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />

          <Button
            label={t('sign_up')}
            onPress={() => {
              void handleSignUp();
            }}
            loading={loading}
            variant="primary"
          />
        </form>

        <p className="mt-4 text-sm text-gray-600">
          {alreadyHavePrefix}
          <Link href="/login" className="text-blue-600 hover:underline">
            {t('sign_in')}
          </Link>
          {alreadyHaveSuffix}
        </p>
      </div>
    </main>
  );
}
