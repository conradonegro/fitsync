import '../global.css';

import * as Sentry from '@sentry/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

import '../i18n';

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
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}
