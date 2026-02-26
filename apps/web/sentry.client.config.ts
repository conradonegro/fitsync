import * as Sentry from '@sentry/nextjs';

/**
 * Sentry client-side (browser) initialization.
 * Loaded automatically by Next.js when the page first loads.
 *
 * Only enabled in production — dev errors are visible in the browser console.
 * Source map upload is handled by withSentryConfig in next.config.ts and
 * only runs during CI builds (SENTRY_AUTH_TOKEN required).
 */
const dsn = process.env.SENTRY_DSN;

Sentry.init({
  ...(dsn !== undefined && { dsn }),
  tracesSampleRate: 1.0,
  enabled: process.env.NODE_ENV === 'production',
});
