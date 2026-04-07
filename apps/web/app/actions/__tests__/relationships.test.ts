/**
 * Unit tests for relationship server actions.
 * All Next.js and Supabase dependencies are mocked.
 */

jest.mock('next/headers');
jest.mock('next/navigation');
jest.mock('@fitsync/database/server');

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@fitsync/database/server';
import {
  acceptInvitation,
  getPendingInviteDetails,
  inviteAthlete,
  revokeRelationship,
} from '../relationships';

// ─── Types ────────────────────────────────────────────────────────────────────

const mockRedirect = redirect as unknown as jest.Mock;
const mockCreateServerClient = createServerClient as jest.Mock;
const mockCookies = cookies as jest.Mock;

// ─── Supabase chainable mock factory ─────────────────────────────────────────

function makeChain(terminalResult: unknown) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(terminalResult),
  };
  // Make the chain itself awaitable (for update without .single())
  (chain as Record<string, unknown>).then = (
    resolve: (v: unknown) => void,
    reject: (e: unknown) => void,
  ) => Promise.resolve(terminalResult).then(resolve, reject);
  return chain;
}

let mockSupabase: {
  auth: { getUser: jest.Mock };
  from: jest.Mock;
  rpc: jest.Mock;
  functions: { invoke: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCookies.mockResolvedValue({});

  mockSupabase = {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
    functions: { invoke: jest.fn().mockResolvedValue({}) },
  };
  mockCreateServerClient.mockReturnValue(mockSupabase);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFormData(email: string) {
  return { get: (key: string) => (key === 'email' ? email : null) } as unknown as FormData;
}

function setUser(id: string | null) {
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: id ? { id } : null } });
}

function setProfile(data: object | null, error: object | null = null) {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return makeChain({ data, error });
    }
    // Default for other tables
    return makeChain({ data: null, error: null });
  });
}

// ─── inviteAthlete ────────────────────────────────────────────────────────────

describe('inviteAthlete', () => {
  it('returns error for invalid email format', async () => {
    const result = await inviteAthlete(null, makeFormData('notanemail'));
    expect(result).toEqual({ error: 'Invalid email address' });
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
  });

  it('returns error for empty email', async () => {
    const result = await inviteAthlete(null, makeFormData(''));
    expect(result).toEqual({ error: 'Invalid email address' });
  });

  it('returns error when not authenticated', async () => {
    setUser(null);
    setProfile({ role: 'trainer', full_name: 'T' });
    const result = await inviteAthlete(null, makeFormData('athlete@example.com'));
    expect(result).toEqual({ error: 'Not authenticated' });
  });

  it('returns error when profile query fails', async () => {
    setUser('trainer-id');
    mockSupabase.from.mockReturnValue(makeChain({ data: null, error: { message: 'db error' } }));
    const result = await inviteAthlete(null, makeFormData('athlete@example.com'));
    expect(result).toEqual({ error: 'Profile not found' });
  });

  it('returns error when profile is null with no error', async () => {
    setUser('trainer-id');
    mockSupabase.from.mockReturnValue(makeChain({ data: null, error: null }));
    const result = await inviteAthlete(null, makeFormData('athlete@example.com'));
    expect(result).toEqual({ error: 'Profile not found' });
  });

  it('returns error when caller is an athlete (not a trainer)', async () => {
    setUser('athlete-id');
    setProfile({ role: 'athlete', full_name: 'Sam' });
    const result = await inviteAthlete(null, makeFormData('other@example.com'));
    expect(result).toEqual({ error: 'Only trainers can invite athletes' });
  });

  it('returns error for duplicate pending invite (code 23505)', async () => {
    setUser('trainer-id');
    // First from() call: profiles
    // Second from() call: coach_athlete_relationships insert
    let callIndex = 0;
    mockSupabase.from.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1)
        return makeChain({ data: { role: 'trainer', full_name: 'T' }, error: null });
      return makeChain({ data: null, error: { code: '23505', message: 'duplicate key' } });
    });

    const result = await inviteAthlete(null, makeFormData('athlete@example.com'));
    expect(result).toEqual({ error: 'An open invitation already exists for this email' });
  });

  it('returns error message for other DB errors', async () => {
    setUser('trainer-id');
    let callIndex = 0;
    mockSupabase.from.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1)
        return makeChain({ data: { role: 'trainer', full_name: 'T' }, error: null });
      return makeChain({ data: null, error: { code: '50000', message: 'unexpected error' } });
    });

    const result = await inviteAthlete(null, makeFormData('athlete@example.com'));
    expect(result).toEqual({ error: 'unexpected error' });
  });

  it('returns {} on success even when Edge Function throws (non-fatal)', async () => {
    setUser('trainer-id');
    let callIndex = 0;
    mockSupabase.from.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1)
        return makeChain({ data: { role: 'trainer', full_name: 'T' }, error: null });
      return makeChain({ data: { id: 'invite-1' }, error: null });
    });
    mockSupabase.functions.invoke.mockRejectedValue(new Error('email failed'));

    const result = await inviteAthlete(null, makeFormData('athlete@example.com'));
    expect(result).toEqual({});
  });

  it('returns {} on full success', async () => {
    setUser('trainer-id');
    let callIndex = 0;
    mockSupabase.from.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1)
        return makeChain({ data: { role: 'trainer', full_name: 'Trainer' }, error: null });
      return makeChain({ data: { id: 'invite-1' }, error: null });
    });

    const result = await inviteAthlete(null, makeFormData('athlete@example.com'));
    expect(result).toEqual({});
  });
});

// ─── getPendingInviteDetails ──────────────────────────────────────────────────

describe('getPendingInviteDetails', () => {
  it('returns unauthenticated when no user', async () => {
    setUser(null);
    const result = await getPendingInviteDetails('invite-1');
    expect(result).toEqual({ kind: 'unauthenticated' });
  });

  it('returns error when RPC fails', async () => {
    setUser('user-1');
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } });
    const result = await getPendingInviteDetails('invite-1');
    expect(result).toEqual({ kind: 'error', error: 'rpc error' });
  });

  it('returns error when RPC returns empty array', async () => {
    setUser('user-1');
    mockSupabase.rpc.mockResolvedValue({ data: [], error: null });
    const result = await getPendingInviteDetails('invite-1');
    expect(result).toEqual({ kind: 'error', error: 'invitation_not_found' });
  });

  it('returns error when RPC returns null data', async () => {
    setUser('user-1');
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
    const result = await getPendingInviteDetails('invite-1');
    expect(result).toEqual({ kind: 'error', error: 'invitation_not_found' });
  });

  it('returns ok with invite on success', async () => {
    setUser('user-1');
    const invite = {
      id: 'invite-1',
      trainer_id: 't-1',
      trainer_name: 'Coach',
      invited_email: 'a@b.com',
      status: 'pending',
      athlete_id: null,
    };
    mockSupabase.rpc.mockResolvedValue({ data: [invite], error: null });
    const result = await getPendingInviteDetails('invite-1');
    expect(result).toEqual({ kind: 'ok', invite });
  });
});

// ─── acceptInvitation ────────────────────────────────────────────────────────

describe('acceptInvitation', () => {
  it('calls redirect("/") on success', async () => {
    mockSupabase.rpc.mockResolvedValue({ error: null });
    await acceptInvitation('invite-1', true);
    expect(mockRedirect).toHaveBeenCalledWith('/');
  });

  it('maps invitation_not_found error to accept_not_found', async () => {
    mockSupabase.rpc.mockResolvedValue({ error: { message: 'invitation_not_found' } });
    const result = await acceptInvitation('invite-1', false);
    expect(result).toEqual({ error: 'accept_not_found' });
  });

  it('maps invitation_not_pending to accept_already_accepted', async () => {
    mockSupabase.rpc.mockResolvedValue({ error: { message: 'invitation_not_pending' } });
    const result = await acceptInvitation('invite-1', false);
    expect(result).toEqual({ error: 'accept_already_accepted' });
  });

  it('maps caller_not_athlete to accept_caller_not_athlete', async () => {
    mockSupabase.rpc.mockResolvedValue({ error: { message: 'caller_not_athlete' } });
    const result = await acceptInvitation('invite-1', false);
    expect(result).toEqual({ error: 'accept_caller_not_athlete' });
  });

  it('maps email_mismatch to accept_email_mismatch', async () => {
    mockSupabase.rpc.mockResolvedValue({ error: { message: 'email_mismatch' } });
    const result = await acceptInvitation('invite-1', false);
    expect(result).toEqual({ error: 'accept_email_mismatch' });
  });

  it('returns raw error message for unrecognised DB errors', async () => {
    mockSupabase.rpc.mockResolvedValue({ error: { message: 'some other database error' } });
    const result = await acceptInvitation('invite-1', true);
    expect(result).toEqual({ error: 'some other database error' });
  });
});

// ─── revokeRelationship ───────────────────────────────────────────────────────

describe('revokeRelationship', () => {
  it('returns error when not authenticated', async () => {
    setUser(null);
    const result = await revokeRelationship('rel-1');
    expect(result).toEqual({ error: 'Not authenticated' });
  });

  it('returns error when update fails', async () => {
    setUser('trainer-id');
    mockSupabase.from.mockReturnValue(makeChain({ error: { message: 'update failed' } }));
    const result = await revokeRelationship('rel-1');
    expect(result).toEqual({ error: 'update failed' });
  });

  it('returns {} on success', async () => {
    setUser('trainer-id');
    mockSupabase.from.mockReturnValue(makeChain({ error: null }));
    const result = await revokeRelationship('rel-1');
    expect(result).toEqual({});
  });

  it('sends the update only for the authenticated trainer (eq trainer_id)', async () => {
    setUser('trainer-123');
    const mockChain = makeChain({ error: null });
    mockSupabase.from.mockReturnValue(mockChain);
    await revokeRelationship('rel-1');
    expect(mockChain.eq).toHaveBeenCalledWith('trainer_id', 'trainer-123');
    expect(mockChain.eq).toHaveBeenCalledWith('id', 'rel-1');
  });
});
