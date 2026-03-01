import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { createServerClient } from '@fitsync/database/server';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Athlete detail page — trainer can see connection date and history placeholder.
 */
export default async function AthleteDetailPage({ params }: Props) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  const t = await getTranslations('roster');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: rel } = await supabase
    .from('coach_athlete_relationships')
    .select('id, status, invited_email, invited_at, accepted_at, profiles!athlete_id(full_name)')
    .eq('id', id)
    .eq('trainer_id', user.id)
    .single();

  if (!rel) {
    notFound();
  }

  const backLink = (
    <Link
      href="/dashboard/athletes"
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      ← {t('page_title')}
    </Link>
  );

  // Pending: show only what the trainer already knows. No profile data is
  // accessible or displayed until the athlete explicitly accepts.
  if (rel.status === 'pending') {
    const invitedDate = rel.invited_at ? new Date(rel.invited_at).toLocaleDateString() : null;
    return (
      <div className="space-y-6">
        {backLink}
        <h1 className="text-2xl font-bold text-gray-900">{t('athlete_detail_title')}</h1>
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-3">
          <div>
            <p className="text-xs text-gray-500">Invited email</p>
            <p className="text-sm font-medium text-gray-900">{rel.invited_email}</p>
          </div>
          {invitedDate && (
            <div>
              <p className="text-xs text-gray-500">Invited</p>
              <p className="text-sm text-gray-700">{invitedDate}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <p className="text-sm text-gray-700">{t('status_pending')}</p>
          </div>
          <p className="text-xs text-gray-400 italic">
            Athlete profile details will be visible once they accept the invitation.
          </p>
        </div>
      </div>
    );
  }

  // Active: show full athlete info.
  const profileData = Array.isArray(rel.profiles) ? rel.profiles[0] : rel.profiles;
  const athleteName = profileData?.full_name ?? rel.invited_email;
  const acceptedDate = rel.accepted_at ? new Date(rel.accepted_at).toLocaleDateString() : null;

  return (
    <div className="space-y-6">
      {backLink}
      <h1 className="text-2xl font-bold text-gray-900">{t('athlete_detail_title')}</h1>

      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-3">
        <div>
          <p className="text-xs text-gray-500">Name</p>
          <p className="text-sm font-medium text-gray-900">{athleteName}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Email</p>
          <p className="text-sm text-gray-700">{rel.invited_email}</p>
        </div>
        {acceptedDate && (
          <div>
            <p className="text-xs text-gray-500">Connected</p>
            <p className="text-sm text-gray-700">{t('connection_date', { date: acceptedDate })}</p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-500">{t('history_placeholder')}</p>
      </div>
    </div>
  );
}
