/**
 * Next.js instrumentation hook.
 * Called once per runtime (nodejs, edge) when the server starts.
 *
 * This is the recommended entry point for Sentry server-side initialization
 * in Next.js App Router. @sentry/nextjs docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
}
