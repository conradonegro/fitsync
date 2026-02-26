/**
 * @fitsync/database/server is not available in React Native.
 *
 * Metro resolves this file via the "react-native" export condition on the
 * "./server" subpath. Typing createServerClient as `never` means any attempt
 * to call it in mobile code is a TypeScript compile-time error:
 *   "This expression is not callable. Type 'never' has no call signatures."
 *
 * Use @fitsync/database (no subpath) for the React Native Supabase client.
 */
export declare const createServerClient: never;
