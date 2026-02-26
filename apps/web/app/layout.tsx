import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import React from 'react';

import './globals.css';
import { QueryProvider } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'FitSync',
  description: 'Professional coaching platform for trainers and athletes.',
};

/**
 * Root layout. Sets up:
 * - next-intl for server + client i18n
 * - TanStack Query provider for client-side data fetching
 * - Inter font
 */
export default async function RootLayout({ children }: { readonly children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <NextIntlClientProvider messages={messages}>
          <QueryProvider>{children}</QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
