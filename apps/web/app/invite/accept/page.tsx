'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useState, useTransition } from 'react';

import { getPendingInviteDetails, acceptInvitation } from '../../actions/relationships';

type InviteState =
  | { kind: 'loading' }
  | { kind: 'unauthenticated' }
  | { kind: 'not_found' }
  | { kind: 'already_accepted' }
  | { kind: 'error'; message: string }
  | { kind: 'pending'; trainerName: string; inviteId: string }
  | { kind: 'accepted' };

/**
 * Inner component — contains useSearchParams, must be inside a Suspense boundary
 * (Next.js 15 requirement for static page generation).
 */
function InviteAcceptContent() {
  const t = useTranslations('roster');
  const tCommon = useTranslations('common');
  const searchParams = useSearchParams();
  const inviteId = searchParams.get('id') ?? '';

  const [state, setState] = useState<InviteState>({ kind: 'loading' });
  const [shareFullHistory, setShareFullHistory] = useState(true);
  const [isPending, startTransition] = useTransition();

  const redirectParam = encodeURIComponent(`/invite/accept?id=${inviteId}`);

  useEffect(() => {
    if (!inviteId) {
      setState({ kind: 'not_found' });
      return;
    }

    void getPendingInviteDetails(inviteId).then((result) => {
      if (result.kind === 'unauthenticated') {
        setState({ kind: 'unauthenticated' });
        return;
      }
      if (result.kind === 'error') {
        if (result.error === 'invitation_not_found') {
          setState({ kind: 'not_found' });
        } else {
          setState({ kind: 'error', message: result.error });
        }
        return;
      }
      if (result.invite.status !== 'pending') {
        setState({ kind: 'already_accepted' });
        return;
      }
      setState({
        kind: 'pending',
        trainerName: result.invite.trainer_name,
        inviteId: result.invite.id,
      });
    });
  }, [inviteId]);

  function handleAccept() {
    if (state.kind !== 'pending') return;
    const currentInviteId = state.inviteId;
    startTransition(async () => {
      const result = await acceptInvitation(currentInviteId, shareFullHistory);
      if (result?.error) {
        // Map i18n key to translated string, falling back to raw message.
        const i18nKeys = [
          'accept_not_found',
          'accept_already_accepted',
          'accept_email_mismatch',
          'accept_caller_not_athlete',
        ] as const;
        const matchedKey = i18nKeys.find((k) => k === result.error);
        setState({ kind: 'error', message: matchedKey ? t(matchedKey) : result.error });
      }
      // On success, acceptInvitation redirects to /, so no state update needed.
    });
  }

  return (
    <div className="w-full max-w-md">
      {state.kind === 'loading' && <p className="text-sm text-gray-500">{tCommon('loading')}</p>}

      {state.kind === 'unauthenticated' && (
        <div className="space-y-4 text-center">
          <h1 className="text-2xl font-bold text-gray-900">{t('accept_title')}</h1>
          <p className="text-sm text-gray-600">{t('accept_login_prompt')}</p>
          <div className="flex justify-center gap-3">
            <Link
              href={`/login?redirect=${redirectParam}`}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Sign in
            </Link>
            <Link
              href={`/signup?redirect=${redirectParam}`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Create account
            </Link>
          </div>
        </div>
      )}

      {state.kind === 'not_found' && (
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">{t('accept_title')}</h1>
          <p className="mt-4 text-sm text-red-600">{t('accept_not_found')}</p>
        </div>
      )}

      {state.kind === 'already_accepted' && (
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">{t('accept_title')}</h1>
          <p className="mt-4 text-sm text-gray-600">{t('accept_already_accepted')}</p>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">{t('accept_title')}</h1>
          <p className="mt-4 text-sm text-red-600">{state.message}</p>
        </div>
      )}

      {state.kind === 'pending' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('accept_title')}</h1>
            <p className="mt-2 text-sm text-gray-600">
              {t('accept_subtitle', { trainerName: state.trainerName })}
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-900">
              {t('accept_history_title')}
            </legend>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                name="history"
                value="full"
                checked={shareFullHistory}
                onChange={() => setShareFullHistory(true)}
                className="mt-0.5"
              />
              <span className="text-sm text-gray-700">{t('accept_history_all')}</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                name="history"
                value="from_now"
                checked={!shareFullHistory}
                onChange={() => setShareFullHistory(false)}
                className="mt-0.5"
              />
              <span className="text-sm text-gray-700">{t('accept_history_from_now')}</span>
            </label>
          </fieldset>

          <button
            onClick={handleAccept}
            disabled={isPending}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? '...' : t('accept_button')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <Suspense>
        <InviteAcceptContent />
      </Suspense>
    </main>
  );
}
