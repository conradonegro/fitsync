'use client';

import type { User } from '@supabase/supabase-js';
import { create } from 'zustand';

interface AuthState {
  user: User | null;
  isInitializing: boolean;
  setUser: (user: User | null) => void;
  setIsInitializing: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isInitializing: true,
  setUser: (user) => set({ user }),
  setIsInitializing: (isInitializing) => set({ isInitializing }),
}));
