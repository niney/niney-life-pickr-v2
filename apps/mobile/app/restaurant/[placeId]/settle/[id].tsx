import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ApiError, useSettlement, useTheme } from '@repo/shared';

// 차수 정산 도입으로 store/스키마가 크게 바뀌었다. 앱의 결과 화면은 후속 PR
// 에서 차수별 표시로 따라잡을 예정 — 임시 read-only 요약만 표시해 컴파일과
// 최소 사용성을 유지.
export default function SettlementResultScreen() {
  const theme = useTheme();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const session = useSettlement(id);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: '정산 결과' }} />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.bg }]}
        contentContainerStyle={styles.content}
      >
        {session.isLoading && (
          <ActivityIndicator color={theme.colors.text} style={{ marginTop: 24 }} />
        )}
        {session.isError && (
          <Text style={[styles.error, { color: theme.colors.danger }]}>
            정산을 불러오지 못했습니다.{' '}
            {session.error instanceof ApiError ? session.error.message : ''}
          </Text>
        )}
        {session.data && (
          <View style={{ gap: 12 }}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              {session.data.restaurantName}
              {session.data.rounds.length > 1
                ? ` 외 ${session.data.rounds.length - 1}곳 (${session.data.rounds.length}차)`
                : ''}
            </Text>
            <Text style={[styles.body, { color: theme.colors.textMuted }]}>
              총 합계 {session.data.grandTotal.toLocaleString('ko-KR')}원 · 참여{' '}
              {session.data.participants.length}명
            </Text>
            <View style={[styles.divider, { borderColor: theme.colors.border }]} />
            {session.data.participants.map((p) => {
              const display =
                (p.name?.trim() ? p.name.trim() : '') +
                (p.nickname?.trim() ? ` (${p.nickname.trim()})` : '');
              return (
                <View key={p.id} style={styles.row}>
                  <Text style={[styles.rowLabel, { color: theme.colors.text }]}>
                    {display || '참여자'}
                  </Text>
                  <Text style={[styles.rowValue, { color: theme.colors.text }]}>
                    {p.shareAmount.toLocaleString('ko-KR')}원
                  </Text>
                </View>
              );
            })}
            <Text style={[styles.note, { color: theme.colors.textMuted }]}>
              차수별 상세·수정·공유는 웹에서 이용해 주세요. 앱 화면은 곧 업데이트 됩니다.
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 8 },
  title: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: '600' },
  note: { fontSize: 12, marginTop: 16 },
  error: { padding: 16, textAlign: 'center' },
});
