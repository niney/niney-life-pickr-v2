import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@repo/shared';
import { MealPreferenceView } from '~/components/meal/MealPreferenceView';

// 식단 설정 — 예전엔 식단 화면의 여섯 번째 탭이었다. 탭을 기록·분석·추천 셋으로 줄이면서
// 식단 화면 헤더의 톱니 아이콘으로 들어오는 별도 화면이 됐다(옛 딥링크 ?tab=preference 도 여기로 보낸다).
export default function MealSettingsScreen() {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bgGrouped }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '식단 설정',
          headerStyle: { backgroundColor: theme.colors.bgGrouped },
        }}
      />
      <MealPreferenceView />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
