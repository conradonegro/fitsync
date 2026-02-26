'use client';

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

/**
 * Catches React rendering errors that bubble up to the root layout.
 * Required by Next.js App Router — replaces the root layout on error, so it
 * must include its own <html> and <body> tags.
 *
 * Sentry will only transmit in production (see sentry.client.config.ts).
 */
export default function GlobalError({ error }: { readonly error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
