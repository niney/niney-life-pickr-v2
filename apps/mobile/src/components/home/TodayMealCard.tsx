import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { MealSlotType } from '@repo/api-contract';
import {
  useAuthStore,
  useMealEntries,
  useMealRecommendationContext,
  useMealTimePresets,
  useTheme,
} from '@repo/shared';
import {
  guessMealSlot,
  MEAL_SLOT_DEFAULT_TIME,
  MEAL_SLOT_LABEL,
  parseTimeOfDay,
  toLocalDateKey,
} from '@repo/utils';
import { setRecordedMealSlotsForToday } from '~/lib/mealReminders';

const DEFAULT_SLOTS: MealSlotType[] = ['breakfast', 'lunch', 'dinner'];

const slotsByTime = (
  slots: readonly MealSlotType[],
  times: Readonly<Record<MealSlotType, string>> = MEAL_SLOT_DEFAULT_TIME,
): MealSlotType[] =>
  [...new Set(slots)].sort(
    (a, b) =>
      (parseTimeOfDay(times[a]) ?? 0) - (parseTimeOfDay(times[b]) ?? 0),
  );

/**
 * 선호 끼니 중 아직 기록하지 않은 현재 시간대를 먼저, 그다음 가까운 시간대를 고른다.
 * 하루의 마지막 끼니도 지난 뒤라면 가장 최근에 놓친 끼니를 보여 준다.
 */
const resolveNextMealSlot = (
  preferredSlots: readonly MealSlotType[],
  recordedSlots: ReadonlySet<MealSlotType>,
  now: Date,
  times: Readonly<Record<MealSlotType, string>> = MEAL_SLOT_DEFAULT_TIME,
): MealSlotType | null => {
  const configured = preferredSlots.length > 0 ? preferredSlots : DEFAULT_SLOTS;
  const missing = slotsByTime(configured, times).filter((slot) => !recordedSlots.has(slot));
  if (missing.length === 0) return null;

  const currentSlot = guessMealSlot(now);
  if (missing.includes(currentSlot)) return currentSlot;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const upcoming = missing.find(
    (slot) => (parseTimeOfDay(times[slot]) ?? 0) >= currentMinutes,
  );
  return upcoming ?? missing[missing.length - 1] ?? null;
};

// 인증이 없는 동안에는 하위 컴포넌트를 마운트하지 않아 로그인 전용 식단 API가 호출되지 않는다.
export const TodayMealCard = () => {
  const token = useAuthStore((state) => state.token);
  const isGuest = useAuthStore((state) => state.isGuest);

  if (!token || isGuest) return null;
  return <AuthenticatedTodayMealCard />;
};

const AuthenticatedTodayMealCard = () => {
  const theme = useTheme();
  const router = useRouter();
  const today = toLocalDateKey(new Date());
  const todayEntries = useMealEntries({ from: today, to: today, limit: 100, withPhotos: false });
  const recommendation = useMealRecommendationContext();
  const timePresets = useMealTimePresets();

  const entries = useMemo(() => todayEntries.data?.items ?? [], [todayEntries.data?.items]);
  const recordedSlots = useMemo(
    () => new Set<MealSlotType>(entries.map((entry) => entry.slot)),
    [entries],
  );
  const personalizedTimes = useMemo(() => {
    const next = { ...MEAL_SLOT_DEFAULT_TIME };
    for (const preset of timePresets.data?.presets ?? []) next[preset.slot] = preset.time;
    return next;
  }, [timePresets.data?.presets]);
  const registeredSlotLabels = useMemo(
    () =>
      slotsByTime([...recordedSlots], personalizedTimes).map((slot) => MEAL_SLOT_LABEL[slot]),
    [personalizedTimes, recordedSlots],
  );
  const preferredSlots = recommendation.data?.preference.slots ?? DEFAULT_SLOTS;
  const nextSlot = resolveNextMealSlot(
    preferredSlots,
    recordedSlots,
    new Date(),
    personalizedTimes,
  );
  const nextPreset = timePresets.data?.presets.find((preset) => preset.slot === nextSlot);

  useEffect(() => {
    if (!todayEntries.data) return;
    setRecordedMealSlotsForToday(recordedSlots);
  }, [recordedSlots, todayEntries.data]);
  const latest = recommendation.data?.latest ?? null;
  const latestSummary = latest
    ? latest.summary.trim() ||
      latest.items
        .slice(0, 2)
        .map((item) => item.name)
        .join(', ')
    : null;
  const entryCountLabel = todayEntries.data?.nextCursor
    ? `${entries.length}+번`
    : `${entries.length}번`;

  return (
    <View
      accessibilityRole="summary"
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceAlt }]}>
          <MaterialCommunityIcons
            name="silverware-fork-knife"
            size={18}
            color={theme.colors.primary}
          />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.colors.text }]}>오늘의 식단</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            빠르게 남기고 다음 끼니도 확인해요
          </Text>
        </View>
        {todayEntries.isFetching && !todayEntries.data ? (
          <ActivityIndicator size="small" color={theme.colors.textMuted} />
        ) : null}
      </View>

      {todayEntries.isError && !todayEntries.data ? (
        <View style={[styles.statusNote, { backgroundColor: theme.colors.surfaceAlt }]}>
          <Text style={[styles.statusNoteText, { color: theme.colors.textMuted }]}>
            오늘 기록을 잠시 불러오지 못했어요.
          </Text>
        </View>
      ) : (
        <View style={styles.metrics}>
          <View style={[styles.metric, { borderColor: theme.colors.border }]}>
            <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>등록한 끼니</Text>
            <Text style={[styles.metricValue, { color: theme.colors.text }]}>
              {entryCountLabel} 기록
            </Text>
            <Text style={[styles.metricSub, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {registeredSlotLabels.length > 0 ? registeredSlotLabels.join(' · ') : '아직 없음'}
            </Text>
          </View>
          <View style={[styles.metric, { borderColor: theme.colors.border }]}>
            <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>
              다음 기록 대상
            </Text>
            <Text style={[styles.metricValue, { color: theme.colors.text }]}>
              {nextSlot ? MEAL_SLOT_LABEL[nextSlot] : '오늘 기록 완료'}
            </Text>
            <Text style={[styles.metricSub, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {nextSlot
                ? `${personalizedTimes[nextSlot]} · ${nextPreset?.fromRecords ? '내 기록 기준' : '기본 시간'}`
                : '설정한 끼니를 모두 남겼어요'}
            </Text>
          </View>
        </View>
      )}

      {latest && latestSummary ? (
        <View style={[styles.recommendation, { backgroundColor: theme.colors.surfaceAlt }]}>
          <MaterialCommunityIcons name="lightbulb-outline" size={17} color={theme.colors.primary} />
          <View style={styles.recommendationText}>
            <Text style={[styles.recommendationLabel, { color: theme.colors.textMuted }]}>
              최신 추천 · {MEAL_SLOT_LABEL[latest.targetSlot]}
            </Text>
            <Text
              style={[styles.recommendationSummary, { color: theme.colors.text }]}
              numberOfLines={2}
            >
              {latestSummary}
            </Text>
          </View>
        </View>
      ) : recommendation.data && !recommendation.isError ? (
        <Text style={[styles.noRecommendation, { color: theme.colors.textMuted }]}>
          아직 추천이 없어요. 식단에서 다음 메뉴를 받아 보세요.
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="식단 전체 보기"
          onPress={() => router.push('/meal' as never)}
          style={({ pressed }) => [
            styles.button,
            styles.secondaryButton,
            { borderColor: theme.colors.border, opacity: pressed ? 0.65 : 1 },
          ]}
        >
          <Text style={[styles.buttonText, { color: theme.colors.text }]}>식단 보기</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="오늘 식단 기록하기"
          onPress={() =>
            router.push((nextSlot ? `/meal/new?slot=${nextSlot}` : '/meal/new') as never)
          }
          style={({ pressed }) => [
            styles.button,
            styles.primaryButton,
            { backgroundColor: pressed ? theme.colors.primaryHover : theme.colors.primary },
          ]}
        >
          <MaterialCommunityIcons name="plus" size={17} color={theme.colors.primaryText} />
          <Text style={[styles.buttonText, { color: theme.colors.primaryText }]}>기록하기</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontSize: 15, fontWeight: '700' },
  subtitle: { fontSize: 11, lineHeight: 15 },
  metrics: { flexDirection: 'row', gap: 8 },
  metric: {
    flex: 1,
    minWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  metricLabel: { fontSize: 11 },
  metricValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  metricSub: { fontSize: 11 },
  statusNote: {
    minHeight: 54,
    borderRadius: 9,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusNoteText: { fontSize: 12, textAlign: 'center' },
  recommendation: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 9,
    padding: 9,
  },
  recommendationText: { flex: 1, minWidth: 0, gap: 2 },
  recommendationLabel: { fontSize: 10, fontWeight: '600' },
  recommendationSummary: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
  noRecommendation: { fontSize: 11, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 8 },
  button: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  secondaryButton: { borderWidth: StyleSheet.hairlineWidth },
  primaryButton: {},
  buttonText: { fontSize: 13, fontWeight: '700' },
});
