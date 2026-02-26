import type { AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

/**
 * next-intl server configuration.
 * Without this file, getMessages() and getLocale() throw at runtime.
 *
 * Translation files live in packages/shared/src/locales/ — shared with the
 * mobile app (react-i18next). Single source of truth.
 *
 * TODO T5: Replace hardcoded locale with detection (Accept-Language header
 * or user profile preference). Locale switching is a Phase 2 feature.
 */
export default getRequestConfig(async () => {
  const locale = 'en';

  const messages = (await import(`../../../packages/shared/src/locales/${locale}.json`))
    .default as AbstractIntlMessages;

  return { locale, messages };
});
