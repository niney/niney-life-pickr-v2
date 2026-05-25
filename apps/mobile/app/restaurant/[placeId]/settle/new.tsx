import { StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@repo/shared';

// 차수(N차) 정산 도입으로 store/스키마가 크게 바뀌었다. 앱 UI 는 후속 PR 에서
// 따라잡을 예정 — 그 사이엔 안내 화면만 표시해 컴파일 안정성 유지.
export default function SettlementNewScreen() {
  const theme = useTheme();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: '정산하기' }} />
      <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          정산 기능 업데이트 중
        </Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          1차·2차 이상 회식을 지원하는 새 정산 흐름을 도입 중입니다. 앱 화면은
          곧 따라잡을 예정이며, 지금은 웹(life-pickr) 에서 정산을 입력하고 결과를
          확인해 주세요.
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
});
