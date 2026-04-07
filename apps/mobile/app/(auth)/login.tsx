import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { supabase } from '@fitsync/database';
import { Button } from '@fitsync/ui';

/**
 * Mobile login screen.
 *
 * Calls supabase.auth.signInWithPassword and handles validation errors.
 * On success the Supabase client stores the session; the AuthGate in
 * _layout.tsx detects the SIGNED_IN event, registers the device, and
 * navigates to the home screen automatically.
 */
export default function LoginScreen() {
  const { t } = useTranslation('auth');
  const { t: tErrors } = useTranslation('errors');
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setError(null);

    // Only validate email format — do NOT enforce password min-length on login.
    // A user with a short password would be permanently locked out here.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(tErrors('invalid_email'));
      return;
    }
    if (!password) {
      setError(tErrors('required'));
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (authError) {
      setError(authError.message);
    }
    // On success: onAuthStateChange in AuthGate fires → device registered → navigation handled
  }

  return (
    <View className="flex-1 bg-white">
      {/* Dark hero header — matches app-wide style */}
      <View className="bg-slate-900 px-6 pb-10 pt-16">
        <Text className="text-3xl font-bold tracking-tight text-white">FitSync</Text>
        <Text className="mt-1 text-sm text-slate-400">{t('sign_in')}</Text>
      </View>

      {/* Form */}
      <View className="flex-1 justify-center px-8">
        <View className="space-y-4">
          <View>
            <Text className="mb-1 text-sm font-medium text-gray-700">{t('email')}</Text>
            <TextInput
              testID="email-input"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </View>

          <View>
            <Text className="mb-1 text-sm font-medium text-gray-700">{t('password')}</Text>
            <TextInput
              testID="password-input"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </View>

          {error !== null && <Text className="text-sm text-red-600">{error}</Text>}

          <Button
            label={t('sign_in')}
            onPress={() => {
              void handleSignIn();
            }}
            loading={loading}
            variant="primary"
          />
        </View>

        <TouchableOpacity onPress={() => router.replace('/(auth)/signup')} className="mt-4">
          <Text className="text-center text-sm text-gray-600">
            {t('no_account', { link: t('sign_up') })}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
