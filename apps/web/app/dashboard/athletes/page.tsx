import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { createServerClient } from '@fitsync/database/server';

import { InviteAthleteForm } from './invite-athlete-form';
import { RevokeButton } from './revoke-button';

/**
 * Trainer athlete roster page.
 * Lists all relationships (pending + active) and provides the invite form.
 */
export default async function AthletesPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  const t = await getTranslations('roster');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: relationships } = await supabase
    .from('coach_athlete_relationships')
    .select('id, status, invited_email, accepted_at, profiles!athlete_id(full_name)')
    .eq('trainer_id', user.id)
    .neq('status', 'revoked')
    .order('invited_at', { ascending: false });

  const rows = relationships ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('page_title')}</h1>

      <InviteAthleteForm />

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">{t('empty_state')}</p>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white">
          <ul className="divide-y divide-gray-100">
            {rows.map((rel) => {
              const profileData = Array.isArray(rel.profiles) ? rel.profiles[0] : rel.profiles;
              const displayName = profileData?.full_name ?? rel.invited_email;
              const statusLabel =
                rel.status === 'active' ? t('status_active') : t('status_pending');
              const statusColor =
                rel.status === 'active'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700';

              return (
                <li key={rel.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{displayName}</p>
                    {profileData?.full_name && (
                      <p className="text-xs text-gray-500">{rel.invited_email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>
                      {statusLabel}
                    </span>
                    <Link
                      href={`/dashboard/athletes/${rel.id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View
                    </Link>
                    <RevokeButton relationshipId={rel.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
