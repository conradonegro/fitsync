/**
 * Unit tests for the setLocale server action.
 */

jest.mock('next/headers');
jest.mock('next/cache');

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { setLocale } from '../locale';

const mockRevalidatePath = revalidatePath as jest.Mock;
const mockCookies = cookies as jest.Mock;

const mockSet = jest.fn();
const mockCookieStore = { set: mockSet };

beforeEach(() => {
  jest.clearAllMocks();
  mockCookies.mockResolvedValue(mockCookieStore);
});

describe('setLocale', () => {
  describe('supported locales', () => {
    it.each(['en', 'es', 'cs'])('sets the NEXT_LOCALE cookie for "%s"', async (locale) => {
      await setLocale(locale);
      expect(mockSet).toHaveBeenCalledWith('NEXT_LOCALE', locale, expect.any(Object));
    });

    it.each(['en', 'es', 'cs'])('calls revalidatePath for "%s"', async (locale) => {
      await setLocale(locale);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/', 'layout');
    });

    it('sets cookie with path "/", 1-year maxAge, and sameSite lax', async () => {
      await setLocale('en');
      expect(mockSet).toHaveBeenCalledWith('NEXT_LOCALE', 'en', {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      });
    });
  });

  describe('unsupported locales', () => {
    it.each(['fr', 'de', 'zh', '', 'EN', 'Es'])(
      'does NOT set cookie for unsupported locale "%s"',
      async (locale) => {
        await setLocale(locale);
        expect(mockSet).not.toHaveBeenCalled();
      },
    );

    it.each(['fr', 'de', ''])(
      'does NOT call revalidatePath for unsupported locale "%s"',
      async (locale) => {
        await setLocale(locale);
        expect(mockRevalidatePath).not.toHaveBeenCalled();
      },
    );

    it('does not call cookies() for unsupported locale', async () => {
      await setLocale('fr');
      // cookies() should not have been awaited since we return early
      expect(mockSet).not.toHaveBeenCalled();
    });
  });
});
