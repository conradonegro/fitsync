'use client';

/**
 * webpack entry point for the web Button.
 * webpack resolves .web.tsx before .tsx, so this is the web bundler entry.
 * All implementation is in button.tsx — single source of truth.
 *
 * 'use client' marks this as a Client Component boundary so it can be
 * rendered inside Next.js Server Components (e.g. app/page.tsx).
 */
export { Button } from './button.tsx';
