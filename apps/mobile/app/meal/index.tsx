import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SegmentedControl, useAuthStore, useInfiniteMealEntries, useTheme, type Theme } from '@repo/shared';
import { mealDateLabel, toLocalDateKey } from '@repo/utils';
import { StateBlock } from '~/components/common/Cards';
import { MealCalendarView } from '~/components/meal/MealCalendarView';
import { MealEntryCard } from '~/components/meal/MealEntryCard';
import { MealPreferenceView } from '~/components/meal/MealPreferenceView';
import { MealRecommendView } from '~/components/meal/MealRecommendView';
import { MealStatsView } from '~/components/meal/MealStatsView';

// 식단 — 기록 / 달력 / 통계. 입력(사진)은 앱에서만 하므로 여기 FAB 가 진입점이다.
// 게스트는 진입점을 볼 수 없지만(프로필에서 숨김) 딥링크로 올 수 있어 화면에서도 안내한다.

type Tab = 'list' | 'calendar' | 'stats' | 'recommend' | 'preference';
const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: 'list', label: '기록' },
  { value: 'calendar', label: '달력' },
  { value: 'stats', label: '통계' },
  { value: 'recommend', label: '추천' },
  { value: 'preference', label: '설정' },
];

export default function MealScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('list');
  const token = useAuthStore((s) => s.token);
  const isGuest = useAuthStore((s) => s.isGuest);
  const loggedIn = !!token && !isGuest;

  const list = useInfiniteMealEntries({ limit: 30 }, loggedIn);
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const today = toLocalDateKey(new Date());

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: '식단' }} />

      {!loggedIn ? (
        <View style={styles.center}>
          <StateBlock kind="empty" message="식단 기록은 로그인 후 사용할 수 있어요." />
          <Pressable accessibilityRole="button" onPress={() => router.replace('/(auth)/login')} style={styles.loginBtn}>
            <Text style={{ color: theme.colors.primaryText, fontWeight: '600' }}>로그인하기</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.tabs}>
            <SegmentedControl
              value={tab}
              onChange={(v) => setTab(v as Tab)}
              options={TABS.map((t) => ({ value: t.value, label: t.label }))}
            />
          </View>

          {tab === 'list' ? (
            <FlatList
              data={items}
              keyExtractor={(e) => e.id}
              contentContainerStyle={styles.listContent}
              refreshing={list.isRefetching && !list.isFetchingNextPage}
              onRefresh={() => void list.refetch()}
              onEndReached={() => {
                if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
              }}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                list.isFetchingNextPage ? <Text style={styles.loadingMore}>기록을 더 불러오는 중…</Text> : null
              }
              ListEmptyComponent={
                list.isLoading ? (
                  <StateBlock kind="loading" />
                ) : list.error ? (
                  <StateBlock kind="error" message="기록을 불러오지 못했습니다." onRetry={() => void list.refetch()} />
                ) : (
                  <StateBlock kind="empty" message="아직 기록이 없어요. 사진으로 첫 끼니를 남겨 보세요." />
                )
              }
              renderItem={({ item, index }) => {
                const prev = items[index - 1];
                const showDate = !prev || prev.eatenDate !== item.eatenDate;
                return (
                  <View style={styles.itemWrap}>
                    {showDate ? <Text style={styles.dateHeader}>{mealDateLabel(item.eatenDate, today)}</Text> : null}
                    <MealEntryCard entry={item} onPress={() => router.push(`/meal/${item.id}` as never)} />
                  </View>
                );
              }}
            />
          ) : tab === 'calendar' ? (
            <MealCalendarView onOpenEntry={(id) => router.push(`/meal/${id}` as never)} />
          ) : tab === 'stats' ? (
            <MealStatsView />
          ) : tab === 'recommend' ? (
            <MealRecommendView />
          ) : (
            <MealPreferenceView />
          )}

          {tab === 'preference' ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="식단 기록하기"
              onPress={() => router.push('/meal/new' as never)}
              style={[styles.fab, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={[styles.fabText, { color: theme.colors.primaryText }]}>＋ 기록</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
    loginBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: 10,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    tabs: { padding: 16, paddingBottom: 8 },
    listContent: { padding: 16, paddingTop: 8, gap: 10, paddingBottom: 96 },
    itemWrap: { gap: 6 },
    dateHeader: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginTop: 6 },
    loadingMore: { paddingVertical: 16, textAlign: 'center', fontSize: 12, color: theme.colors.textMuted },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 28,
      borderRadius: 999,
      paddingHorizontal: 20,
      paddingVertical: 14,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },
    fabText: { fontSize: 15, fontWeight: '700' },
  });
