/**
 * Unit tests for useAuthStore standalone functions and store actions.
 */

// Use explicit factory so jest.fn() instances are predictably wired — auto-mock of the
// expo-native-stub can produce stale references when clearAllMocks re-evaluates.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('@fitsync/database');

import * as SecureStore from 'expo-secure-store';
import { supabase } from '@fitsync/database';
import { getOrCreateDeviceId, registerDevice, useAuthStore } from '../auth.store';

const mockGetItemAsync = SecureStore.getItemAsync as jest.Mock;
const mockSetItemAsync = SecureStore.setItemAsync as jest.Mock;
const mockSupabase = supabase as jest.Mocked<typeof supabase>;

beforeEach(() => {
  jest.clearAllMocks();

  // Reset store
  useAuthStore.setState({ user: null, deviceId: null, isInitializing: true });
});

// ─── getOrCreateDeviceId ──────────────────────────────────────────────────────

describe('getOrCreateDeviceId', () => {
  it('returns stored device id when one exists', async () => {
    mockGetItemAsync.mockResolvedValue('existing-device-id');
    const id = await getOrCreateDeviceId();
    expect(id).toBe('existing-device-id');
    expect(mockSetItemAsync).not.toHaveBeenCalled();
  });

  it('generates and stores a new id when none exists', async () => {
    mockGetItemAsync.mockResolvedValue(null);
    mockSetItemAsync.mockResolvedValue(undefined);
    const id = await getOrCreateDeviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/i); // UUID pattern
    expect(mockSetItemAsync).toHaveBeenCalledWith('fitsync_device_id', id);
  });

  it('returns a non-empty string id', async () => {
    mockGetItemAsync.mockResolvedValue(null);
    mockSetItemAsync.mockResolvedValue(undefined);
    const id = await getOrCreateDeviceId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});

// ─── registerDevice ───────────────────────────────────────────────────────────

describe('registerDevice', () => {
  beforeEach(() => {
    // Setup supabase.from chain for user_devices upsert
    const mockUpsert = jest.fn().mockResolvedValue({ error: null });
    (mockSupabase.from as jest.Mock).mockReturnValue({ upsert: mockUpsert });
  });

  it('calls supabase upsert with user_id, device_id, and last_seen_at', async () => {
    await registerDevice('user-1', 'device-1');
    expect(mockSupabase.from).toHaveBeenCalledWith('user_devices');
    const upsertCall = (mockSupabase.from as jest.Mock).mock.results[0]!.value.upsert;
    expect(upsertCall).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', device_id: 'device-1' }),
      { onConflict: 'user_id,device_id' },
    );
  });

  it('includes last_seen_at as an ISO timestamp', async () => {
    await registerDevice('user-1', 'device-1');
    const upsertCall = (mockSupabase.from as jest.Mock).mock.results[0]!.value.upsert;
    const [payload] = upsertCall.mock.calls[0] as [Record<string, string>];
    expect(payload.last_seen_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does not throw when supabase returns an error (__DEV__ is false)', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ error: { message: 'network error' } });
    (mockSupabase.from as jest.Mock).mockReturnValue({ upsert: mockUpsert });
    await expect(registerDevice('user-1', 'device-1')).resolves.not.toThrow();
  });
});

// ─── Store actions ────────────────────────────────────────────────────────────

describe('useAuthStore actions', () => {
  it('setUser stores the user', () => {
    const user = { id: 'user-1', email: 'test@example.com' } as any;
    useAuthStore.getState().setUser(user);
    expect(useAuthStore.getState().user).toEqual(user);
  });

  it('setUser accepts null (signed out)', () => {
    useAuthStore.setState({ user: { id: 'u1' } as any });
    useAuthStore.getState().setUser(null);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('setDeviceId stores the device id', () => {
    useAuthStore.getState().setDeviceId('new-device');
    expect(useAuthStore.getState().deviceId).toBe('new-device');
  });

  it('setIsInitializing sets the flag', () => {
    useAuthStore.getState().setIsInitializing(false);
    expect(useAuthStore.getState().isInitializing).toBe(false);
  });

  it('signOut calls supabase.auth.signOut and sets user to null', async () => {
    useAuthStore.setState({ user: { id: 'u1' } as any });
    (mockSupabase.auth.signOut as jest.Mock).mockResolvedValue({});
    await useAuthStore.getState().signOut();
    expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toBeNull();
  });
});
