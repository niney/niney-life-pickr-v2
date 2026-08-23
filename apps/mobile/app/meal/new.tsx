import { Stack, useLocalSearchParams } from 'expo-router';
import type { MealSlotType } from '@repo/api-contract';
import { MEAL_SLOTS } from '@repo/utils';
import { MealEntryEditor } from '~/components/meal/MealEntryEditor';

// 새 식단 기록 — 화면 파일은 껍데기만, 로직은 src/components/meal/MealEntryEditor.
export default function NewMealScreen() {
  const params = useLocalSearchParams<{ slot?: string | string[] }>();
  const slotValue = Array.isArray(params.slot) ? params.slot[0] : params.slot;
  const initialSlot = (MEAL_SLOTS as readonly string[]).includes(slotValue ?? '')
    ? (slotValue as MealSlotType)
    : undefined;
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: '식단 기록' }} />
      <MealEntryEditor initialSlot={initialSlot} />
    </>
  );
}
