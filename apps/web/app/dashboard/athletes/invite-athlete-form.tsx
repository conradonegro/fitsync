'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { inviteAthlete } from '../../actions/relationships';

export function InviteAthleteForm() {
  const t = useTranslations('roster');
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessEmail(null);
    setIsPending(true);

    const formData = new FormData(e.currentTarget);
    const result = await inviteAthlete(null, formData);

    setIsPending(false);

    if (result?.error) {
      setError(result.error);
    } else {
      setSuccessEmail(email);
      setEmail('');
      formRef.current?.reset();
      router.refresh();
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-base font-semibold text-gray-900">{t('invite_title')}</h2>
      <form ref={formRef} onSubmit={(e) => void handleSubmit(e)} className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="invite-email" className="sr-only">
            {t('invite_email_label')}
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('invite_email_placeholder')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? '...' : t('invite_button')}
        </button>
      </form>
      {error !== null && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {successEmail !== null && (
        <p className="mt-2 text-sm text-green-600">
          {t('invite_success', { email: successEmail })}
        </p>
      )}
    </div>
  );
}
