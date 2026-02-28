import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { supabase } from '@fitsync/database';
import { signupSchema, type UserRole } from '@fitsync/shared';
import { Button } from '@fitsync/ui';

type FieldErrors = Partial<Record<'full_name' | 'email' | 'password', string>>;

/**
 * Mobile signup screen.
 *
 * Stores full_name and role in user_metadata so the handle_new_user() trigger
 * can populate public.profiles. On success the AuthGate detects the SIGNED_IN
 * event, registers the device, and navigates to the home screen automatically.
 */
export default function SignupScreen() {
  const { t } = useTranslation('auth');
  const { t: tErrors } = useTranslation('errors');
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('athlete');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    setFieldErrors({});
    setSubmitError(null);

    const result = signupSchema.safeParse({ full_name: fullName, email, password, role });
    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        if (!errors[field]) {
          if (field === 'email') errors.email = tErrors('invalid_email');
          else if (field === 'password') errors.password = tErrors('password_too_short');
          else errors.full_name = tErrors('required');
        }
      }
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signUp({
      email: result.data.email,
      password: result.data.password,
      options: {
        data: {
          full_name: result.data.full_name,
          role: result.data.role,
        },
      },
    });
    setLoading(false);

    if (authError) {
      setSubmitError(authError.message);
    }
    // On success: onAuthStateChange in AuthGate fires → device registered → navigation handled
  }

  const inputBase = 'rounded-md border px-3 py-2 text-sm text-gray-900';
  const inputValid = `${inputBase} border-gray-300`;
  const inputInvalid = `${inputBase} border-red-400`;

  return (
    <View className="flex-1 items-center justify-center bg-white p-8">
      <View className="w-full max-w-sm">
        <Text className="mb-6 text-2xl font-bold text-gray-900">{t('sign_up')}</Text>

        <View className="space-y-4">
          <View>
            <Text className="mb-1 text-sm font-medium text-gray-700">{t('full_name')}</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoComplete="name"
              className={fieldErrors.full_name ? inputInvalid : inputValid}
            />
            {fieldErrors.full_name && (
              <Text className="mt-1 text-xs text-red-600">{fieldErrors.full_name}</Text>
            )}
          </View>

          <View>
            <Text className="mb-1 text-sm font-medium text-gray-700">{t('email')}</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              className={fieldErrors.email ? inputInvalid : inputValid}
            />
            {fieldErrors.email && (
              <Text className="mt-1 text-xs text-red-600">{fieldErrors.email}</Text>
            )}
          </View>

          <View>
            <Text className="mb-1 text-sm font-medium text-gray-700">{t('password')}</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              className={fieldErrors.password ? inputInvalid : inputValid}
            />
            {fieldErrors.password && (
              <Text className="mt-1 text-xs text-red-600">{fieldErrors.password}</Text>
            )}
          </View>

          <View>
            <Text className="mb-2 text-sm font-medium text-gray-700">{t('role_label')}</Text>
            <View className="flex-row gap-3">
              {(['trainer', 'athlete'] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setRole(r)}
                  className={`flex-1 rounded-md border px-3 py-2 ${
                    role === r ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                  }`}
                >
                  <Text
                    className={`text-center text-sm ${
                      role === r ? 'font-medium text-blue-700' : 'text-gray-700'
                    }`}
                  >
                    {t(r === 'trainer' ? 'role_trainer' : 'role_athlete')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {submitError !== null && <Text className="text-sm text-red-600">{submitError}</Text>}

          <Button
            label={t('sign_up')}
            onPress={() => {
              void handleSignUp();
            }}
            loading={loading}
            variant="primary"
          />
        </View>

        <TouchableOpacity onPress={() => router.push('/(auth)/login')} className="mt-4">
          <Text className="text-center text-sm text-gray-600">
            {t('already_have_account', { link: t('sign_in') })}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
