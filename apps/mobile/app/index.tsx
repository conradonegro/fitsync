import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button } from '@fitsync/ui';

/**
 * Placeholder home screen. Replaced with the athlete dashboard in T9.
 */
export default function HomeScreen() {
  const { t } = useTranslation('common');

  return (
    <View className="flex-1 items-center justify-center bg-white p-6">
      <Text className="text-4xl font-bold text-gray-900">FitSync</Text>
      <Text className="mt-2 text-base text-gray-500">{t('loading')}</Text>
      <View className="mt-8 w-full">
        <Button label={t('done')} onPress={() => undefined} variant="primary" />
      </View>
    </View>
  );
}
