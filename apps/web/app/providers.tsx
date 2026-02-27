'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import React, { useEffect, useState } from 'react';

import { supabase } from '@fitsync/database';

import { useAuthStore } from '../store/auth.store';

/**
 * Renderless component that wires Supabase session events to the Zustand auth store.
 *
 * getSession() reads from localStorage synchronously (no network call), then
 * setIsInitializing(false) prevents protected pages from flashing.
 * onAuthStateChange keeps the store in sync for token refreshes and sign-outs.
 *
 * Note: unauthenticated redirect is handled server-side by middleware.ts.
 * isInitializing is available for client components that need it.
 */
function AuthStoreInitializer() {
  const { setUser, setIsInitializing } = useAuthStore();

  useEffect(() => {
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
  }, [setUser, setIsInitializing]);

  return null;
}

/**
 * TanStack Query client provider.
 *
 * CRITICAL: QueryClient is created inside useState, NOT as a module-level singleton.
 * A module-level singleton on the server would persist across requests and leak
 * one user's cached data to another user's request.
 *
 * See ADR-009 and the Next.js TanStack Query docs for full rationale.
 */
export const QueryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthStoreInitializer />
      {children}
      {process.env['NODE_ENV'] === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
};
