import type { User } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { supabase } from '@fitsync/database';

const DEVICE_ID_KEY = 'fitsync_device_id';

export async function getOrCreateDeviceId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (stored) return stored;
  const id = globalThis.crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

export async function registerDevice(userId: string, deviceId: string): Promise<void> {
  await supabase
    .from('user_devices')
    .upsert(
      { user_id: userId, device_id: deviceId, last_seen_at: new Date().toISOString() },
      { onConflict: 'user_id,device_id' },
    );
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
