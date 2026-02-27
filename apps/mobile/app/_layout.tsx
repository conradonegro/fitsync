import '../global.css';

import * as Sentry from '@sentry/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useRouter, useSegments, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { supabase } from '@fitsync/database';

import '../i18n';
import { getOrCreateDeviceId, useAuthStore } from '../store/auth.store';

/**
 * Sentry must be initialized before any app code runs.
 * DSN is injected at build time via app.config.ts → Constants.expoConfig.extra.
 * Disabled in development (__DEV__) — use the Metro console for error visibility.
 */
const sentryDsn = Constants.expoConfig?.extra?.sentryDsn;

Sentry.init({
  ...(typeof sentryDsn === 'string' && { dsn: sentryDsn }),
  enabled: !__DEV__,
  tracesSampleRate: 1.0,
});

/**
 * AuthGate controls navigation based on auth state.
 *
 * On mount:
 * 1. Resolves or creates a persistent device_id via expo-secure-store.
 * 2. Reads the current session from AsyncStorage (no network call).
 * 3. Subscribes to onAuthStateChange for token refreshes and sign-outs.
 *
 * Returns null while isInitializing to prevent any content flash.
 * Navigation side-effects run in a separate useEffect that watches
 * [user, isInitializing, segments] so they never fire during render.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Cast to string[] — useSegments() is typed to known routes, but (auth) group
  // is valid at runtime and will be included once expo start regenerates types.
  const segments = useSegments() as string[];
  const { user, isInitializing, setUser, setDeviceId, setIsInitializing } = useAuthStore();

  useEffect(() => {
    // Resolve device_id without blocking session initialisation
    getOrCreateDeviceId()
      .then(setDeviceId)
      .catch(() => undefined);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setDeviceId, setIsInitializing]);

  useEffect(() => {
    if (isInitializing) return;

    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/');
    }
  }, [user, isInitializing, segments, router]);

  if (isInitializing) {
    return <View className="flex-1 bg-white" />;
  }

  return <>{children}</>;
}

/**
 * Root Expo Router layout.
 * - global.css must be imported first for NativeWind to work.
 * - i18n is imported for side-effect initialisation.
 * - QueryClient created inside useState (never a module-level singleton).
 */
export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60 * 1000, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
        </Stack>
        <StatusBar style="auto" />
      </AuthGate>
    </QueryClientProvider>
  );
}
