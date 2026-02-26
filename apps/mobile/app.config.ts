import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Expo app configuration.
 *
 * CRITICAL: This must be app.config.ts (not app.json) so that environment
 * variables can be read at config build time via process.env.
 *
 * At runtime, use expo-constants to access these values:
 *   import Constants from 'expo-constants';
 *   const url = Constants.expoConfig?.extra?.supabaseUrl;
 *
 * Changes to native config (permissions, plugins, URL schemes) require
 * a new EAS Build — they cannot be shipped via OTA update.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'FitSync',
  slug: 'fitsync',
  owner: 'conradonegro',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.fitsync.app',
    // OAuth redirect URL scheme — registered now even though OAuth is deferred.
    // Adding this later requires a new EAS Build + App Store submission.
    // See ADR-021.
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'com.fitsync.app',
  },
  web: {
    bundler: 'metro',
    output: 'static',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-sqlite',
      {
        // Ensure SQLite database is stored in the Documents directory (persistent).
        // NOT the cache directory — that can be cleared by the OS under storage pressure.
      },
    ],
    // Health data plugin to be added in Phase 2:
    // 'expo-health' for HealthKit (iOS)
    // 'react-native-health-connect' for Health Connect (Android)
  ],
  scheme: 'fitsync', // OAuth URL scheme — used for deep links and future OAuth
  newArchEnabled: true,
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // Environment variables injected at build time.
    // Access at runtime via Constants.expoConfig?.extra
    supabaseUrl: process.env['SUPABASE_URL'],
    supabaseAnonKey: process.env['SUPABASE_ANON_KEY'],
    sentryDsn: process.env['SENTRY_DSN'],
    eas: {
      projectId: process.env['EAS_PROJECT_ID'],
    },
  },
});
