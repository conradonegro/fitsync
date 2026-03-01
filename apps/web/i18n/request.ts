import { cookies } from 'next/headers';
import type { AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

/**
 * next-intl server configuration.
 * Without this file, getMessages() and getLocale() throw at runtime.
 *
 * Locale is read from the NEXT_LOCALE cookie (set by the LocaleSwitcher
 * component via the setLocale server action). Falls back to 'en'.
 * Translation files live in packages/shared/src/locales/ — shared with the
 * mobile app (react-i18next). Single source of truth.
 */

const SUPPORTED = ['en', 'es', 'cs'] as const;
export type AppLocale = (typeof SUPPORTED)[number];

function toLocale(raw: string | undefined): AppLocale {
  return (SUPPORTED as readonly string[]).includes(raw ?? '') ? (raw as AppLocale) : 'en';
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = toLocale(cookieStore.get('NEXT_LOCALE')?.value);

  const messages = (await import(`../../../packages/shared/src/locales/${locale}.json`))
    .default as AbstractIntlMessages;

  return { locale, messages };
});
