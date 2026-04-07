import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { createServerClient } from '@fitsync/database/server';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Athlete detail page — trainer can see connection date and synced workout history.
 */
export default async function AthleteDetailPage({ params }: Props) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  const t = await getTranslations('roster');
  const tWorkout = await getTranslations('workout');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: rel } = await supabase
    .from('coach_athlete_relationships')
    .select(
      'id, status, athlete_id, history_shared_from, invited_email, invited_at, accepted_at, profiles!athlete_id(full_name)',
    )
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

  // Active: rel.athlete_id must be present.
  if (rel.athlete_id === null) notFound();

  // Active: show full athlete info.
  const profileData = Array.isArray(rel.profiles) ? rel.profiles[0] : rel.profiles;
  const athleteName = profileData?.full_name ?? rel.invited_email;
  const acceptedDate = rel.accepted_at ? new Date(rel.accepted_at).toLocaleDateString() : null;

  // Fetch synced workout sessions visible to this trainer.
  const historyFrom = rel.history_shared_from ?? rel.accepted_at;
  const sessionsQuery = supabase
    .from('workout_sessions')
    .select('id, started_at, ended_at, workout_events(event_type, payload, client_sequence)')
    .eq('athlete_id', rel.athlete_id)
    .order('started_at', { ascending: false })
    .limit(20);

  const { data: sessions } = historyFrom
    ? await sessionsQuery.gte('started_at', historyFrom)
    : await sessionsQuery;

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

      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">{tWorkout('workout_history')}</h2>
        {!sessions || sessions.length === 0 ? (
          <p className="text-sm text-gray-500">{tWorkout('no_workouts')}</p>
        ) : (
          <ul className="space-y-4">
            {sessions.map((session) => {
              const startDate = new Date(session.started_at).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              });
              const startTime = new Date(session.started_at).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              });

              const durationMinutes =
                session.ended_at != null
                  ? Math.round(
                      (new Date(session.ended_at).getTime() -
                        new Date(session.started_at).getTime()) /
                        60_000,
                    )
                  : null;

              const setEvents = (session.workout_events ?? []).filter(
                (e) => e.event_type === 'set_logged',
              );
              const setCount = setEvents.length;

              return (
                <li
                  key={session.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">
                      {startDate} · {startTime}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {durationMinutes != null ? (
                        <span>{tWorkout('duration_minutes', { minutes: durationMinutes })}</span>
                      ) : (
                        <span className="text-yellow-600">In progress</span>
                      )}
                      <span>{tWorkout('session_sets', { count: setCount })}</span>
                    </div>
                  </div>
                  {setCount > 0 && (
                    <ul className="mt-1 space-y-1">
                      {setEvents
                        .sort((a, b) => a.client_sequence - b.client_sequence)
                        .map((e) => {
                          const p = e.payload as Record<string, unknown>;
                          const exercise = String(p.exercise_name ?? '');
                          const setNumber = Number(p.set_number ?? 0);
                          const reps = Number(p.reps ?? 0);
                          const weightKg = Number(p.weight_kg ?? 0);
                          return (
                            <li key={e.client_sequence} className="text-xs text-gray-600">
                              {exercise} — Set {setNumber}: {reps} × {weightKg} kg
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
