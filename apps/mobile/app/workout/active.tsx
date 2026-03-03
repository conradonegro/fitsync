import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  View,
} from 'react-native';

import { logSetInputSchema } from '@fitsync/shared';
import { Button } from '@fitsync/ui';

import { OfflineIndicator } from '../../components/OfflineIndicator';
import type { LoggedSet } from '../../store/workout.store';
import { useWorkoutStore } from '../../store/workout.store';

export default function ActiveWorkoutScreen() {
  const { t } = useTranslation('workout');
  const { t: tCommon } = useTranslation('common');
  const router = useRouter();

  const { activeSessionId, loggedSets, logSet, finishWorkout } = useWorkoutStore();

  const [exerciseName, setExerciseName] = useState('');
  const [reps, setReps] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (activeSessionId === null) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6">
        <Text className="mb-6 text-base text-gray-600">{t('no_active_session')}</Text>
        <Button
          label={t('go_back')}
          onPress={() => {
            router.replace('/');
          }}
          variant="secondary"
        />
      </View>
    );
  }

  async function handleLogSet() {
    setFieldError(null);
    const result = logSetInputSchema.safeParse({
      exercise_name: exerciseName.trim(),
      reps: parseInt(reps, 10),
      weight_kg: parseFloat(weightKg),
    });

    if (!result.success) {
      const firstError = result.error.errors[0];
      setFieldError(firstError?.message ?? 'Invalid input');
      return;
    }

    setSubmitting(true);
    try {
      await logSet(result.data);
      // Keep exercise name for multi-set entry; clear reps + weight
      setReps('');
      setWeightKg('');
    } finally {
      setSubmitting(false);
    }
  }

  function confirmFinish() {
    Alert.alert(t('finish_workout'), tCommon('confirm'), [
      { text: tCommon('cancel'), style: 'cancel' },
      {
        text: tCommon('confirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await finishWorkout();
            router.replace('/');
          })();
        },
      },
    ]);
  }

  function renderSetRow({ item }: { item: LoggedSet }) {
    return (
      <View className="flex-row items-center justify-between border-b border-gray-100 py-3">
        <View>
          <Text className="text-sm font-medium text-gray-900">{item.exerciseName}</Text>
          <Text className="text-xs text-gray-500">
            {t('set_number', { number: item.setNumber })}
          </Text>
        </View>
        <Text className="text-sm text-gray-700">
          {item.reps} × {item.weightKg} kg
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <OfflineIndicator />

      <View className="flex-1 px-6 pt-12">
        <Text className="mb-6 text-2xl font-bold text-gray-900">{t('active_workout')}</Text>

        {/* Set entry form */}
        <View className="mb-4 space-y-3">
          <View>
            <Text className="mb-1 text-sm font-medium text-gray-700">{t('exercise_name')}</Text>
            <TextInput
              value={exerciseName}
              onChangeText={setExerciseName}
              autoCapitalize="words"
              placeholder={t('exercise_name_placeholder')}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">{t('reps')}</Text>
              <TextInput
                value={reps}
                onChangeText={setReps}
                keyboardType="number-pad"
                placeholder="0"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </View>

            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">{t('weight_kg')}</Text>
              <TextInput
                value={weightKg}
                onChangeText={setWeightKg}
                keyboardType="decimal-pad"
                placeholder="0"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </View>
          </View>

          {fieldError !== null && <Text className="text-sm text-red-600">{fieldError}</Text>}

          <Button
            label={t('add_set')}
            onPress={() => {
              void handleLogSet();
            }}
            loading={submitting}
            variant="primary"
          />
        </View>

        {/* Logged sets list */}
        <FlatList<LoggedSet>
          data={loggedSets}
          keyExtractor={(item) => item.id}
          renderItem={renderSetRow}
          className="flex-1"
          ListEmptyComponent={null}
        />

        {/* Finish button */}
        <View className="pb-8 pt-4">
          <Button label={t('finish_workout')} onPress={confirmFinish} variant="destructive" />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
