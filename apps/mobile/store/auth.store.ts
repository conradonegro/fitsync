import type { User } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { supabase } from '@fitsync/database';

const DEVICE_ID_KEY = 'fitsync_device_id';

/** Generates a UUID v4. Uses crypto.randomUUID() when available (Hermes/modern
 *  engines), falls back to Math.random for older Expo Go environments. */
function generateUUID(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cryptoApi = (globalThis as any).crypto as { randomUUID?: () => string } | undefined;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  // RFC 4122 v4 — not cryptographically secure, but device_id only needs uniqueness
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function getOrCreateDeviceId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (stored) return stored;
  const id = generateUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

export async function registerDevice(userId: string, deviceId: string): Promise<void> {
  const { error } = await supabase
    .from('user_devices')
    .upsert(
      { user_id: userId, device_id: deviceId, last_seen_at: new Date().toISOString() },
      { onConflict: 'user_id,device_id' },
    );
  if (__DEV__ && error) {
    console.error('[registerDevice] Failed:', error.message, error.details);
  }
}

interface AuthState {
  user: User | null;
  deviceId: string | null;
  isInitializing: boolean;
  setUser: (user: User | null) => void;
  setDeviceId: (deviceId: string) => void;
  setIsInitializing: (value: boolean) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  deviceId: null,
  isInitializing: true,
  setUser: (user) => set({ user }),
  setDeviceId: (deviceId) => set({ deviceId }),
  setIsInitializing: (isInitializing) => set({ isInitializing }),
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null });
  },
}));
