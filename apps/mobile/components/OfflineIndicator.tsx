import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useWorkoutStore } from '../store/workout.store';

/**
 * Displays a yellow banner when the device is offline.
 * Returns null when online — zero layout impact.
 *
 * Uses a selector to avoid re-rendering when other workout state changes.
 */
export function OfflineIndicator() {
  const { t } = useTranslation('workout');
  const isOnline = useWorkoutStore((state) => state.isOnline);

  if (isOnline) return null;

  return (
    <View className="w-full bg-yellow-400 px-4 py-2">
      <Text className="text-center text-sm font-medium text-yellow-900">
        {t('offline_warning')}
      </Text>
    </View>
  );
}
