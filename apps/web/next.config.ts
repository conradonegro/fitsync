import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/**
 * Next.js 15 configuration.
 *
 * 1. withNextIntl: wires next-intl's request config so getMessages() and
 *    getLocale() work in Server Components. Without this wrapper they throw.
 *
 * 2. transpilePackages: @fitsync/* packages are TypeScript source — Next.js
 *    must transpile them. Without this, builds fail.
 *
 * 3. webpack resolveExtensions: inserts .web.tsx/.web.ts before .tsx/.ts so
 *    @fitsync/ui platform-split components resolve to the DOM implementation.
 *    Without this, Next.js imports .native.tsx and crashes with
 *    "View is not defined".
 *
 *    Next.js 15 still uses webpack as the default production bundler.
 *    Do NOT switch to Turbopack until next-intl and @sentry/nextjs confirm
 *    support. Tracked in ARCHITECTURE.md.
 */
const nextConfig = {
  transpilePackages: [
    '@fitsync/shared',
    '@fitsync/database',
    '@fitsync/database-types',
    '@fitsync/ui',
  ],

  webpack: (config: { resolve: { extensions: string[] } }) => {
    config.resolve.extensions = [
      '.web.tsx',
      '.web.ts',
      ...config.resolve.extensions.filter((e: string) => e !== '.web.tsx' && e !== '.web.ts'),
    ];
    return config;
  },

  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  // Suppress Sentry build output unless in CI.
  silent: !process.env.CI,
  // Source maps are uploaded only in CI builds where SENTRY_AUTH_TOKEN is set.
  // Locally, source maps stay on disk and are never sent to Sentry (ADR: no source maps in dev).
  sourcemaps: {
    disable: !process.env.CI,
  },
});
