'use client';

import { useLocale } from 'next-intl';

import { setLocale } from '../actions/locale';

const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'cs', label: 'Čeština' },
];

export function LocaleSwitcher() {
  const locale = useLocale();

  return (
    <select
      value={locale}
      onChange={(e) => void setLocale(e.target.value)}
      aria-label="Select language"
      className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 shadow-sm hover:border-gray-300 focus:outline-none"
    >
      {LOCALES.map(({ code, label }) => (
        <option key={code} value={code}>
          {label}
        </option>
      ))}
    </select>
  );
}
