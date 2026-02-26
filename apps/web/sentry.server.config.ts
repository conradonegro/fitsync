import * as Sentry from '@sentry/nextjs';

/**
 * Sentry server-side (Node.js runtime) initialization.
 * Imported via instrumentation.ts when NEXT_RUNTIME === 'nodejs'.
 */
const dsn = process.env.SENTRY_DSN;

Sentry.init({
  ...(dsn !== undefined && { dsn }),
  tracesSampleRate: 1.0,
  enabled: process.env.NODE_ENV === 'production',
});
