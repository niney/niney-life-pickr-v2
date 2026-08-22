import { Stack } from 'expo-router';
import { MealEntryEditor } from '~/components/meal/MealEntryEditor';

// 새 식단 기록 — 화면 파일은 껍데기만, 로직은 src/components/meal/MealEntryEditor.
export default function NewMealScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: '식단 기록' }} />
      <MealEntryEditor />
    </>
  );
}
