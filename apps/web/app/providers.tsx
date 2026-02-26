'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import React, { useState } from 'react';

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
      {children}
      {process.env['NODE_ENV'] === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
};
