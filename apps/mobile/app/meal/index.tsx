import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  daysBetween,
  isMealSlot,
  mealDateLabel,
  mealDateTitle,
  toLocalDateKey,
} from '@repo/utils';
import { StateBlock } from '~/components/common/Cards';
import { MealCalendarView } from '~/components/meal/MealCalendarView';
import { MealEntryCard } from '~/components/meal/MealEntryCard';
import { MealNutritionView } from '~/components/meal/MealNutritionView';
import { MealPreferenceView } from '~/components/meal/MealPreferenceView';
import { MealRecommendView } from '~/components/meal/MealRecommendView';
import { MealStatsView } from '~/components/meal/MealStatsView';
import { Chip, ChipRow, FieldLabel, MealIconButton, MealSection } from '~/components/meal/mealUi';
import {
  MEAL_FAB_SIZE,
  mealFont,
  mealRadius,
  useMealFabInsets,
} from '~/components/meal/mealTokens';

// 식단 — 기록 / 달력 / 통계 / 추천 / 영양 / 설정. 입력(사진)은 앱에서만 하므로 여기 FAB 가 진입점이다.
// 게스트는 진입점을 볼 수 없지만(프로필에서 숨김) 딥링크로 올 수 있어 화면에서도 안내한다.
//
// 기록 목록은 검색창 + 필터 버튼만 위에 두고, 필터는 버튼을 눌러야 펼친다(접혀 있으면 걸린 조건만 칩으로 보인다).
// 필터 패널이 첫 화면을 다 차지해 기록이 아래로 밀리던 것을 고쳤다.

type Tab = 'list' | 'calendar' | 'stats' | 'recommend' | 'nutrition' | 'preference';
const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: 'list', label: '기록' },
  { value: 'calendar', label: '달력' },
  { value: 'stats', label: '통계' },
  { value: 'recommend', label: '추천' },
  { value: 'nutrition', label: '영양' },
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
  const { fabBottom, contentBottom } = useMealFabInsets();
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
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  // 접힌 상태에서 보여 줄 '걸린 조건' 칩 — 누르면 그 조건만 푼다.
  const activeFilters: ReadonlyArray<{ key: string; label: string; clear: () => void }> = [
    periodDays !== null
      ? {
          key: 'period',
          label: PERIOD_OPTIONS.find((o) => o.value === periodDays)?.label ?? '',
          clear: () => setPeriodDays(null),
        }
      : null,
    slotFilter ? { key: 'slot', label: MEAL_SLOT_LABEL[slotFilter], clear: () => setSlotFilter(null) } : null,
    mealTypeFilter
      ? { key: 'type', label: MEAL_TYPE_LABEL[mealTypeFilter], clear: () => setMealTypeFilter(null) }
      : null,
    sourceFilter
      ? {
          key: 'source',
          label: MEAL_ENTRY_SOURCES.find((s) => s.value === sourceFilter)?.label ?? '',
          clear: () => setSourceFilter(null),
        }
      : null,
  ].filter((f): f is { key: string; label: string; clear: () => void } => f !== null);
  const hasActiveFilters = appliedQ.length > 0 || activeFilters.length > 0;

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
            <Text style={{ color: theme.colors.primaryText, fontSize: mealFont.body, fontWeight: '600' }}>
              로그인하기
            </Text>
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
              contentContainerStyle={[styles.listContent, { paddingBottom: contentBottom }]}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              refreshing={list.isRefetching && !list.isFetchingNextPage}
              onRefresh={() => void list.refetch()}
              onEndReached={() => {
                if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
              }}
              onEndReachedThreshold={0.5}
              ListHeaderComponent={
                <View style={styles.listHeader}>
                  <View style={styles.searchRow}>
                    <View style={styles.searchField}>
                      <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.textMuted} />
                      <TextInput
                        accessibilityLabel="식단 기록 검색어"
                        value={searchText}
                        onChangeText={setSearchText}
                        onSubmitEditing={applySearch}
                        returnKeyType="search"
                        placeholder="음식·장소·메모 검색"
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
                          <MaterialCommunityIcons name="close-circle" size={18} color={theme.colors.textMuted} />
                        </Pressable>
                      ) : null}
                    </View>
                    <MealIconButton
                      icon="tune-variant"
                      size={44}
                      accessibilityLabel={filtersOpen ? '필터 접기' : '필터 펼치기'}
                      active={filtersOpen}
                      badge={filtersOpen ? undefined : activeFilters.length}
                      onPress={() => setFiltersOpen((open) => !open)}
                    />
                  </View>

                  {filtersOpen ? (
                    <MealSection>
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

                      <View style={styles.filterActions}>
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
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setFiltersOpen(false)}
                          style={styles.doneBtn}
                        >
                          <Text style={styles.doneText}>완료</Text>
                        </Pressable>
                      </View>
                    </MealSection>
                  ) : activeFilters.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.activeRow}
                      keyboardShouldPersistTaps="handled"
                    >
                      {activeFilters.map((f) => (
                        <Chip
                          key={f.key}
                          label={f.label}
                          selected
                          trailingIcon="close"
                          accessibilityLabel={`${f.label} 조건 풀기`}
                          onPress={f.clear}
                        />
                      ))}
                      <Chip label="초기화" onPress={resetFilters} />
                    </ScrollView>
                  ) : null}

                  {list.data && hasActiveFilters ? (
                    <Text style={styles.resultMeta}>
                      찾은 기록 {items.length.toLocaleString('ko-KR')}
                      {list.hasNextPage ? '+' : ''}건
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
                // 일주일 안은 '오늘'·'어제'·'3일 전'을 크게, 날짜는 오른쪽에 작게 둔다. 그 밖은 날짜만.
                const diff = daysBetween(item.eatenDate, today);
                const relative = diff !== null && diff >= 0 && diff <= 6;
                return (
                  <View style={styles.itemWrap}>
                    {showDate ? (
                      <View style={[styles.dateRow, index === 0 ? null : styles.dateRowGap]}>
                        <Text style={styles.dateHeader}>
                          {relative ? mealDateLabel(item.eatenDate, today) : mealDateTitle(item.eatenDate, today)}
                        </Text>
                        {relative ? <Text style={styles.dateSub}>{mealDateTitle(item.eatenDate, today)}</Text> : null}
                      </View>
                    ) : null}
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
          ) : tab === 'nutrition' ? (
            <MealNutritionView />
          ) : (
            <MealPreferenceView />
          )}

          {tab === 'preference' ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="식단 기록하기"
              onPress={() => router.push('/meal/new' as never)}
              style={({ pressed }) => [
                styles.fab,
                { bottom: fabBottom, backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <MaterialCommunityIcons name="plus" size={30} color={theme.colors.primaryText} />
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bgGrouped },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
    loginBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: mealRadius.control,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    // 탭 줄은 헤더와 같은 바탕에 붙여 두고, 그 아래부터 회색 바탕 위 카드가 이어진다.
    tabs: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 12,
      backgroundColor: theme.colors.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    listContent: { padding: 16, gap: 8 },
    listHeader: { gap: 10, marginBottom: 4 },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    searchField: {
      flex: 1,
      height: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: mealRadius.control,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
    },
    searchInput: {
      flex: 1,
      height: 44,
      color: theme.colors.text,
      fontSize: mealFont.body,
    },
    filterGroup: { gap: 8 },
    filterActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16 },
    resetText: { color: theme.colors.textMuted, fontSize: mealFont.callout, fontWeight: '600' },
    doneBtn: {
      borderRadius: mealRadius.control,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 18,
      paddingVertical: 9,
    },
    doneText: { color: theme.colors.primaryText, fontSize: mealFont.callout, fontWeight: '700' },
    activeRow: { gap: 8, paddingRight: 16 },
    resultMeta: { color: theme.colors.textMuted, fontSize: mealFont.caption },
    itemWrap: { gap: 8 },
    dateRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 4 },
    dateRowGap: { marginTop: 12 },
    dateHeader: { fontSize: mealFont.body, fontWeight: '700', color: theme.colors.text },
    dateSub: { fontSize: mealFont.caption, color: theme.colors.textMuted },
    loadingMore: {
      paddingVertical: 16,
      textAlign: 'center',
      fontSize: mealFont.caption,
      color: theme.colors.textMuted,
    },
    fab: {
      position: 'absolute',
      right: 20,
      width: MEAL_FAB_SIZE,
      height: MEAL_FAB_SIZE,
      borderRadius: MEAL_FAB_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.22,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
  });
