import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';

import { Button } from '@fitsync/ui';

import { OfflineIndicator } from '../components/OfflineIndicator';
import { useAuthStore } from '../store/auth.store';
import { useWorkoutStore } from '../store/workout.store';

export default function HomeScreen() {
  const { t } = useTranslation('workout');
  const { t: tCommon } = useTranslation('common');
  const { t: tAuth } = useTranslation('auth');
  const router = useRouter();

  const { user, signOut, deviceId } = useAuthStore();
  const { activeSessionId, pendingEventCount, syncStatus, startWorkout, performSync } =
    useWorkoutStore();

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  async function handleStartWorkout() {
    await startWorkout();
    router.push('/workout/active');
  }

  return (
    <View className="flex-1 bg-white">
      <OfflineIndicator />

      {/* Dark hero header */}
      <View className="bg-slate-900 px-6 pb-10 pt-16">
        <Text className="text-3xl font-bold tracking-tight text-white">FitSync</Text>
        <Text className="mt-1 text-sm text-slate-400">{today}</Text>
        {user?.email !== undefined && (
          <Text className="mt-0.5 text-xs text-slate-500">{user.email}</Text>
        )}
      </View>

      {/* Content */}
      <View className="flex-1 px-6 pt-8">
        {syncStatus === 'syncing' && (
          <View className="mb-6 flex-row items-center gap-2 rounded-lg bg-blue-50 px-4 py-3">
            <View className="h-2 w-2 rounded-full bg-blue-400" />
            <Text className="text-sm font-medium text-blue-700">{t('sync_syncing')}</Text>
          </View>
        )}
        {syncStatus === 'error' && (
          <View className="mb-6 flex-row items-center justify-between rounded-lg bg-orange-50 px-4 py-3">
            <View className="flex-row items-center gap-2">
              <View className="h-2 w-2 rounded-full bg-orange-400" />
              <Text className="text-sm font-medium text-orange-700">{t('sync_error')}</Text>
            </View>
            <TouchableOpacity onPress={() => void performSync()}>
              <Text className="text-sm font-semibold text-orange-600">{tCommon('retry')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {syncStatus === 'idle' && pendingEventCount > 0 && (
          <View className="mb-6 flex-row items-center gap-2 rounded-lg bg-blue-50 px-4 py-3">
            <View className="h-2 w-2 rounded-full bg-blue-400" />
            <Text className="text-sm font-medium text-blue-700">
              {t('pending_events', { count: pendingEventCount })}
            </Text>
          </View>
        )}

        <View className="gap-3">
          {activeSessionId !== null ? (
            <Button
              label={t('resume_workout')}
              onPress={() => {
                router.push('/workout/active');
              }}
              variant="primary"
            />
          ) : (
            <Button
              label={t('start_workout')}
              onPress={() => {
                void handleStartWorkout();
              }}
              disabled={deviceId === null}
              variant="primary"
            />
          )}

          <Button
            label={tAuth('sign_out')}
            onPress={() => {
              void signOut();
            }}
            variant="secondary"
          />
        </View>
      </View>
    </View>
  );
}
