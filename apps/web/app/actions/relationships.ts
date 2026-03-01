'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { createServerClient } from '@fitsync/database/server';
import { inviteAthleteSchema } from '@fitsync/shared';

// ============================================================
// inviteAthlete — trainer sends an invitation to an athlete
// ============================================================

export async function inviteAthlete(
  _prevState: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = formData.get('email');
  const parsed = inviteAthleteSchema.safeParse({ email });
  if (!parsed.success) {
    return { error: 'Invalid email address' };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Verify the caller is a trainer.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return { error: 'Profile not found' };
  }
  if (profile.role !== 'trainer') {
    return { error: 'Only trainers can invite athletes' };
  }

  // Insert the pending invite row.
  const { data: row, error: insertError } = await supabase
    .from('coach_athlete_relationships')
    .insert({
      trainer_id: user.id,
      invited_email: parsed.data.email,
      athlete_id: null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError) {
    // Unique index violation: duplicate open invite.
    if (insertError.code === '23505') {
      return { error: 'An open invitation already exists for this email' };
    }
    return { error: insertError.message };
  }

  const appUrl = process.env['APP_URL'] ?? 'http://localhost:3000';
  const acceptUrl = `${appUrl}/invite/accept?id=${row.id}`;

  // Call the Edge Function to send the email. Failure is non-fatal —
  // the DB row exists so the accept link will still work.
  try {
    await supabase.functions.invoke('send-invitation', {
      body: {
        trainerName: profile.full_name,
        athleteEmail: parsed.data.email,
        acceptUrl,
      },
    });
  } catch {
    // Log but don't surface email errors to the trainer UI.
    console.error('send-invitation Edge Function failed');
  }

  return {};
}

// ============================================================
// getPendingInviteDetails — called from the accept page on mount
// ============================================================

export type PendingInvite = {
  id: string;
  trainer_id: string;
  trainer_name: string;
  invited_email: string;
  status: string;
  athlete_id: string | null;
};

export type PendingInviteResult =
  | { kind: 'ok'; invite: PendingInvite }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; error: string };

export async function getPendingInviteDetails(inviteId: string): Promise<PendingInviteResult> {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { kind: 'unauthenticated' };
  }

  const { data, error } = await supabase.rpc('get_pending_invite', {
    p_invite_id: inviteId,
  });

  if (error) {
    return { kind: 'error', error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return { kind: 'error', error: 'invitation_not_found' };
  }

  return { kind: 'ok', invite: row };
}

// ============================================================
// acceptInvitation — athlete accepts a pending invite
// ============================================================

export async function acceptInvitation(
  inviteId: string,
  shareFullHistory: boolean,
): Promise<{ error?: string }> {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const { error } = await supabase.rpc('accept_invitation', {
    p_invite_id: inviteId,
    p_share_full_history: shareFullHistory,
  });

  if (error) {
    // Map DB exception strings to i18n keys used by the UI.
    const msg = error.message;
    if (msg.includes('invitation_not_found')) return { error: 'accept_not_found' };
    if (msg.includes('invitation_not_pending')) return { error: 'accept_already_accepted' };
    if (msg.includes('caller_not_athlete')) return { error: 'accept_caller_not_athlete' };
    if (msg.includes('email_mismatch')) return { error: 'accept_email_mismatch' };
    return { error: msg };
  }

  redirect('/');
}

// ============================================================
// revokeRelationship — trainer removes a pending or active relationship
// ============================================================

export async function revokeRelationship(id: string): Promise<{ error?: string }> {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('coach_athlete_relationships')
    .update({ status: 'revoked' })
    .eq('id', id)
    .eq('trainer_id', user.id);

  if (error) return { error: error.message };
  return {};
}
