import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { supabase } from '@fitsync/database';
import { loginSchema } from '@fitsync/shared';
import { Button } from '@fitsync/ui';

import { getOrCreateDeviceId, registerDevice, useAuthStore } from '../../store/auth.store';

/**
 * Mobile login screen.
 *
 * After successful sign-in: persists deviceId to store, registers the device
 * in user_devices, then updates the auth store — the AuthGate in _layout.tsx
 * detects the user change and navigates to the home screen automatically.
 */
export default function LoginScreen() {
  const { t } = useTranslation('auth');
  const { t: tErrors } = useTranslation('errors');
  const router = useRouter();
  const { setUser, setDeviceId } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setError(null);

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      if (firstIssue?.path[0] === 'email') {
        setError(tErrors('invalid_email'));
      } else {
        setError(tErrors('password_too_short'));
      }
      return;
    }

    setLoading(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: result.data.email,
      password: result.data.password,
    });
    setLoading(false);

    if (authError || !data.user) {
      setError(authError?.message ?? tErrors('required'));
      return;
    }

    const deviceId = await getOrCreateDeviceId();
    setDeviceId(deviceId);
    await registerDevice(data.user.id, deviceId);
    setUser(data.user);
  }

  return (
    <View className="flex-1 items-center justify-center bg-white p-8">
      <View className="w-full max-w-sm">
        <Text className="mb-6 text-2xl font-bold text-gray-900">{t('sign_in')}</Text>

        <View className="space-y-4">
          <View>
            <Text className="mb-1 text-sm font-medium text-gray-700">{t('email')}</Text>
            <TextInput
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

        <TouchableOpacity onPress={() => router.push('/(auth)/signup')} className="mt-4">
          <Text className="text-center text-sm text-gray-600">
            {t('no_account', { link: t('sign_up') })}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
