/**
 * i18next configuration for React Native.
 *
 * Key decisions:
 * 1. Interpolation uses single-brace {variable} syntax (not default {{variable}})
 *    to match next-intl's syntax, enabling shared translation JSON files.
 *    See ADR-005.
 *
 * 2. Translation files are imported from @fitsync/shared/locales to ensure
 *    a single source of truth across web and mobile.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import shared translation files from packages/shared
import cs from '@fitsync/shared/locales/cs';
import en from '@fitsync/shared/locales/en';
import es from '@fitsync/shared/locales/es';

void i18n.use(initReactI18next).init({
  compatibilityJSON: 'v3',
  lng: 'en',
  fallbackLng: 'en',
  // Each top-level key of the shared JSON becomes its own namespace, matching
  // the next-intl structure used on the web (useTranslations('auth') etc.).
  ns: ['common', 'auth', 'errors'],
  defaultNS: 'common',
  resources: {
    en: { common: en.common, auth: en.auth, errors: en.errors },
    es: { common: es.common, auth: es.auth, errors: es.errors },
    cs: { common: cs.common, auth: cs.auth, errors: cs.errors },
  },
  interpolation: {
    // Single-brace syntax to match next-intl. MUST NOT be changed
    // without updating all translation files and the web app config.
    prefix: '{',
    suffix: '}',
    escapeValue: false,
  },
});

export default i18n;
