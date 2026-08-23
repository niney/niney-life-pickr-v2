import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type {
  MealEntrySourceType,
  MealSlotType,
  MealTypeType,
} from '@repo/api-contract';
import { SegmentedControl, useAuthStore, useInfiniteMealEntries, useTheme, type Theme } from '@repo/shared';
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABEL,
  MEAL_TYPES,
  MEAL_TYPE_LABEL,
  isMealSlot,
  mealDateLabel,
  toLocalDateKey,
} from '@repo/utils';
import { StateBlock } from '~/components/common/Cards';
import { MealCalendarView } from '~/components/meal/MealCalendarView';
import { MealEntryCard } from '~/components/meal/MealEntryCard';
import { MealPreferenceView } from '~/components/meal/MealPreferenceView';
import { MealRecommendView } from '~/components/meal/MealRecommendView';
import { MealStatsView } from '~/components/meal/MealStatsView';
import { Chip, ChipRow, FieldLabel } from '~/components/meal/mealUi';

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

type PeriodDays = 7 | 30 | 90 | null;
const PERIOD_OPTIONS: ReadonlyArray<{ value: PeriodDays; label: string }> = [
  { value: null, label: '전체' },
  { value: 7, label: '7일' },
  { value: 30, label: '30일' },
  { value: 90, label: '90일' },
];

const MEAL_ENTRY_SOURCES: ReadonlyArray<{
  value: MealEntrySourceType;
  label: string;
}> = [
  { value: 'photo', label: '사진' },
  { value: 'manual', label: '직접 입력' },
  { value: 'recommendation', label: '추천' },
];

const dateRangeForPeriod = (
  days: PeriodDays,
  today: string,
): { from?: string; to?: string } => {
  if (days === null) return {};
  const from = new Date(`${today}T12:00:00`);
  // 자정 경계/DST가 있는 기기에서도 날짜를 안정적으로 빼도록 정오에서 계산한다.
  from.setHours(12, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));
  return { from: toLocalDateKey(from), to: today };
};

export default function MealScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const params = useLocalSearchParams<{
    tab?: string | string[];
    slot?: string | string[];
  }>();
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const requestedSlot = Array.isArray(params.slot) ? params.slot[0] : params.slot;
  const initialSlot = isMealSlot(requestedSlot) ? requestedSlot : undefined;
  const initialTab = TABS.some((candidate) => candidate.value === requestedTab)
    ? (requestedTab as Tab)
    : 'list';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [searchText, setSearchText] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [periodDays, setPeriodDays] = useState<PeriodDays>(null);
  const [slotFilter, setSlotFilter] = useState<MealSlotType | null>(null);
  const [mealTypeFilter, setMealTypeFilter] = useState<MealTypeType | null>(null);
  const [sourceFilter, setSourceFilter] = useState<MealEntrySourceType | null>(null);
  const token = useAuthStore((s) => s.token);
  const isGuest = useAuthStore((s) => s.isGuest);
  const loggedIn = !!token && !isGuest;

  const today = toLocalDateKey(new Date());
  const periodRange = useMemo(() => dateRangeForPeriod(periodDays, today), [periodDays, today]);
  const listQuery = useMemo(
    () => ({
      limit: 30,
      ...periodRange,
      q: appliedQ || undefined,
      slot: slotFilter ?? undefined,
      mealType: mealTypeFilter ?? undefined,
      source: sourceFilter ?? undefined,
    }),
    [appliedQ, mealTypeFilter, periodRange, slotFilter, sourceFilter],
  );
  const list = useInfiniteMealEntries(listQuery, loggedIn);
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const hasActiveFilters =
    appliedQ.length > 0 ||
    periodDays !== null ||
    slotFilter !== null ||
    mealTypeFilter !== null ||
    sourceFilter !== null;

  const applySearch = () => setAppliedQ(searchText.trim());
  const resetFilters = () => {
    setSearchText('');
    setAppliedQ('');
    setPeriodDays(null);
    setSlotFilter(null);
    setMealTypeFilter(null);
    setSourceFilter(null);
  };

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
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              refreshing={list.isRefetching && !list.isFetchingNextPage}
              onRefresh={() => void list.refetch()}
              onEndReached={() => {
                if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
              }}
              onEndReachedThreshold={0.5}
              ListHeaderComponent={
                <View style={styles.filters}>
                  <View style={styles.filterTitleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.filterTitle}>누적 기록 찾기</Text>
                      <Text style={styles.filterHint}>음식·장소·메모를 한 번에 검색해요</Text>
                    </View>
                    {hasActiveFilters ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="식단 검색 필터 초기화"
                        onPress={resetFilters}
                        hitSlop={8}
                      >
                        <Text style={styles.resetText}>초기화</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={styles.searchRow}>
                    <View style={styles.searchInputWrap}>
                      <TextInput
                        accessibilityLabel="식단 기록 검색어"
                        value={searchText}
                        onChangeText={setSearchText}
                        onSubmitEditing={applySearch}
                        returnKeyType="search"
                        placeholder="예: 김치찌개, 회사, 야근"
                        placeholderTextColor={theme.colors.textMuted}
                        style={styles.searchInput}
                        maxLength={80}
                      />
                      {searchText ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="검색어 지우기"
                          onPress={() => {
                            setSearchText('');
                            setAppliedQ('');
                          }}
                          hitSlop={8}
                        >
                          <Text style={styles.searchClear}>✕</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="식단 기록 검색"
                      onPress={applySearch}
                      style={styles.searchButton}
                    >
                      <Text style={styles.searchButtonText}>검색</Text>
                    </Pressable>
                  </View>

                  <View style={styles.filterGroup}>
                    <FieldLabel>기간</FieldLabel>
                    <ChipRow>
                      {PERIOD_OPTIONS.map((option) => (
                        <Chip
                          key={option.label}
                          label={option.label}
                          selected={periodDays === option.value}
                          onPress={() => setPeriodDays(option.value)}
                        />
                      ))}
                    </ChipRow>
                  </View>

                  <View style={styles.filterGroup}>
                    <FieldLabel>끼니</FieldLabel>
                    <ChipRow>
                      <Chip label="전체" selected={slotFilter === null} onPress={() => setSlotFilter(null)} />
                      {MEAL_SLOTS.map((slot) => (
                        <Chip
                          key={slot}
                          label={MEAL_SLOT_LABEL[slot]}
                          selected={slotFilter === slot}
                          onPress={() => setSlotFilter(slotFilter === slot ? null : slot)}
                        />
                      ))}
                    </ChipRow>
                  </View>

                  <View style={styles.filterGroup}>
                    <FieldLabel>식사 방식</FieldLabel>
                    <ChipRow>
                      <Chip
                        label="전체"
                        selected={mealTypeFilter === null}
                        onPress={() => setMealTypeFilter(null)}
                      />
                      {MEAL_TYPES.map((mealType) => (
                        <Chip
                          key={mealType}
                          label={MEAL_TYPE_LABEL[mealType]}
                          selected={mealTypeFilter === mealType}
                          onPress={() =>
                            setMealTypeFilter(mealTypeFilter === mealType ? null : mealType)
                          }
                        />
                      ))}
                    </ChipRow>
                  </View>

                  <View style={styles.filterGroup}>
                    <FieldLabel>기록 출처</FieldLabel>
                    <ChipRow>
                      <Chip
                        label="전체"
                        selected={sourceFilter === null}
                        onPress={() => setSourceFilter(null)}
                      />
                      {MEAL_ENTRY_SOURCES.map((source) => (
                        <Chip
                          key={source.value}
                          label={source.label}
                          selected={sourceFilter === source.value}
                          onPress={() =>
                            setSourceFilter(sourceFilter === source.value ? null : source.value)
                          }
                        />
                      ))}
                    </ChipRow>
                  </View>

                  {list.data ? (
                    <Text style={styles.resultMeta}>
                      {items.length.toLocaleString('ko-KR')}
                      {list.hasNextPage ? '+' : ''}건 불러옴
                    </Text>
                  ) : null}
                </View>
              }
              ListFooterComponent={
                list.isFetchingNextPage ? <Text style={styles.loadingMore}>기록을 더 불러오는 중…</Text> : null
              }
              ListEmptyComponent={
                list.isLoading ? (
                  <StateBlock kind="loading" />
                ) : list.error ? (
                  <StateBlock kind="error" message="기록을 불러오지 못했습니다." onRetry={() => void list.refetch()} />
                ) : (
                  <StateBlock
                    kind="empty"
                    message={
                      hasActiveFilters
                        ? '조건에 맞는 기록이 없어요. 검색어나 필터를 바꿔 보세요.'
                        : '아직 기록이 없어요. 사진으로 첫 끼니를 남겨 보세요.'
                    }
                  />
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
            <MealRecommendView key={initialSlot ?? 'auto'} initialSlot={initialSlot} />
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
    filters: {
      gap: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
      padding: 12,
      marginBottom: 4,
    },
    filterTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    filterTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '700' },
    filterHint: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
    resetText: { color: theme.colors.primary, fontSize: 12, fontWeight: '600' },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    searchInputWrap: {
      flex: 1,
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: 10,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 11,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 9,
      color: theme.colors.text,
      fontSize: 14,
    },
    searchClear: { color: theme.colors.textMuted, fontSize: 13, paddingLeft: 8 },
    searchButton: {
      minHeight: 42,
      borderRadius: 10,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchButtonText: { color: theme.colors.primaryText, fontSize: 13, fontWeight: '700' },
    filterGroup: { gap: 7 },
    resultMeta: { color: theme.colors.textMuted, fontSize: 11, textAlign: 'right' },
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
