import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { MealRecommendationType, MealSlotType, MealTypeType } from '@repo/api-contract';
import {
  ApiError,
  useAirLocation,
  useCreateMealRecommendation,
  useFoodRestaurants,
  useMealDraftStore,
  useMealRecommendationContext,
  useMealRecommendationFeedback,
  useTheme,
  type Theme,
} from '@repo/shared';
import {
  FOOD_DISH_TYPE_LABEL,
  MEAL_SLOTS,
  MEAL_SLOT_LABEL,
  MEAL_TYPES,
  MEAL_TYPE_LABEL,
  guessMealSlot,
  toLocalDateKey,
} from '@repo/utils';
import { Card, CardTitle, Note, StateBlock } from '~/components/common/Cards';
import { Chip, ChipRow, FieldLabel } from './mealUi';

// 다음 끼니 추천 — 끼니·상황을 고르고 받는다. 서버가 같은 날·끼니·프로필이면 캐시를 돌려주므로
// "추천받기"는 싸고, "다시 추천"만 LLM 을 새로 부른다(일일 한도도 그때만 센다).
//
// "이거 먹었어요"는 추천을 그대로 기록으로 넘긴다 — draft 에 음식을 넣고 입력 화면으로 보낸다.

export const MealRecommendView = () => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const draft = useMealDraftStore();

  const [slot, setSlot] = useState<MealSlotType>(() => guessMealSlot(new Date()));
  const [mealType, setMealType] = useState<MealTypeType | null | undefined>(undefined);
  const [note, setNote] = useState('');
  const [current, setCurrent] = useState<MealRecommendationType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ctx = useMealRecommendationContext();
  const airLocation = useAirLocation();
  const create = useCreateMealRecommendation();
  const feedback = useMealRecommendationFeedback();

  const shown = current ?? ctx.data?.latest ?? null;
  const configuredSlots = ctx.data?.preference.slots.length
    ? ctx.data.preference.slots
    : MEAL_SLOTS;
  const configuredMealTypes = ctx.data?.preference.mealTypes.length
    ? ctx.data.preference.mealTypes
    : MEAL_TYPES;
  const effectiveSlot = configuredSlots.includes(slot) ? slot : configuredSlots[0]!;
  const effectiveMealType =
    mealType === undefined ? (ctx.data?.preference.mealTypes[0] ?? null) : mealType;

  const request = (force: boolean) => {
    setError(null);
    create.mutate(
      {
        targetDate: toLocalDateKey(new Date()),
        targetSlot: effectiveSlot,
        mealType: effectiveMealType,
        note: note.trim() ? note.trim() : null,
        lat: airLocation.location?.lat ?? null,
        lng: airLocation.location?.lng ?? null,
        force,
      },
      {
        onSuccess: (rec) => setCurrent(rec),
        onError: (e) => setError(e instanceof ApiError ? e.message : '추천을 받지 못했어요.'),
      },
    );
  };

  // 추천을 기록으로 — draft 를 그 음식으로 시작하고 입력 화면으로 보낸다.
  const eatThis = (rec: MealRecommendationType, name: string) => {
    const now = new Date();
    const item = rec.items.find((i) => i.name === name);
    draft.start({
      eatenAt: now.toISOString(),
      eatenDate: toLocalDateKey(now),
      slot: rec.targetSlot,
      mealType: effectiveMealType,
      originRecommendationId: rec.id,
    });
    draft.addItem({
      name,
      foodId: item?.foodId ?? null,
      dishType: item?.dishType ?? null,
      mainIngredient: item?.mainIngredient ?? null,
      cuisine: item?.cuisine ?? null,
      portion: null,
      isMain: true,
      confidence: null,
      source: 'recommendation',
      candidates: [],
    });
    router.push('/meal/new' as never);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card>
        <CardTitle title="다음 끼니 추천" sub="기록을 보고 겹치지 않게 골라 드려요" />

        <FieldLabel>끼니</FieldLabel>
        <ChipRow>
          {configuredSlots.map((s) => (
            <Chip key={s} label={MEAL_SLOT_LABEL[s]} selected={effectiveSlot === s} onPress={() => setSlot(s)} />
          ))}
        </ChipRow>

        <FieldLabel>상황</FieldLabel>
        <ChipRow>
          {configuredMealTypes.map((t) => (
            <Chip
              key={t}
              label={MEAL_TYPE_LABEL[t]}
              selected={effectiveMealType === t}
              onPress={() => setMealType(effectiveMealType === t ? null : t)}
            />
          ))}
        </ChipRow>

        <Text style={styles.locationHint}>
          {airLocation.location
            ? `저장된 위치(${airLocation.location.label ?? '내 위치'})의 실시간 날씨를 반영해요.`
            : '날씨에서 내 위치를 저장하면 실시간 날씨도 반영해요.'}
        </Text>

        <FieldLabel>한 마디 (선택)</FieldLabel>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="예: 가볍게 / 국물 있는 걸로"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.note}
          maxLength={120}
        />

        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => request(false)}
            disabled={create.isPending}
            style={[styles.primaryBtn, { backgroundColor: theme.colors.primary, opacity: create.isPending ? 0.6 : 1 }]}
          >
            {create.isPending ? (
              <ActivityIndicator size="small" color={theme.colors.primaryText} />
            ) : (
              <Text style={{ color: theme.colors.primaryText, fontWeight: '700' }}>추천받기</Text>
            )}
          </Pressable>
          {shown ? <Chip label="다시 추천" onPress={() => request(true)} disabled={create.isPending} /> : null}
        </View>

        {error ? <Note tone="warn">{error}</Note> : null}
        {ctx.data && ctx.data.entryCount === 0 ? (
          <Note tone="muted">기록이 아직 없어요. 몇 끼만 남기면 추천이 훨씬 정확해져요.</Note>
        ) : null}
      </Card>

      {shown ? (
        <Card>
          <CardTitle
            title={`${shown.targetDate} ${MEAL_SLOT_LABEL[shown.targetSlot]} 추천`}
            sub={shown.summary || null}
          />
          {shown.notice ? <Note tone="warn">{shown.notice}</Note> : null}
          {shown.status === 'fallback' ? <Note tone="muted">AI 없이 기록 점수만으로 골랐어요.</Note> : null}

          {shown.items.length === 0 ? (
            <StateBlock kind="empty" message="추천할 음식을 찾지 못했어요." />
          ) : (
            <View style={styles.itemList}>
              {shown.items.map((item) => (
                <View key={item.name} style={styles.itemCard}>
                  <View style={styles.itemHead}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.dishType ? <Text style={styles.itemMeta}>{FOOD_DISH_TYPE_LABEL[item.dishType]}</Text> : null}
                    <Text style={styles.itemMeta}>
                      {item.lastEatenDate ? `마지막 ${item.lastEatenDate.slice(5)}` : '안 먹어봄'}
                    </Text>
                  </View>
                  <Text style={styles.itemReason}>{item.reason}</Text>
                  {item.ingredients.length > 0 ? (
                    <Text style={styles.itemIngredients}>주재료 {item.ingredients.join(', ')}</Text>
                  ) : null}
                  {item.tags.length > 0 ? (
                    <ChipRow>
                      {item.tags.map((t) => (
                        <Chip key={t} label={t} />
                      ))}
                    </ChipRow>
                  ) : null}
                  <View style={styles.itemActions}>
                    <Pressable accessibilityRole="button" onPress={() => eatThis(shown, item.name)} style={styles.eatBtn}>
                      <Text style={{ color: theme.colors.primary, fontWeight: '600', fontSize: 13 }}>이거 먹었어요</Text>
                    </Pressable>
                    <FoodRestaurantMatches
                      foodId={item.foodId}
                      foodName={item.name}
                      lat={airLocation.location?.lat ?? null}
                      lng={airLocation.location?.lng ?? null}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.feedbackRow}>
            <Text style={styles.feedbackLabel}>이 추천 어땠나요?</Text>
            <Chip
              label="👍"
              selected={shown.feedback?.rating === 1}
              onPress={() =>
                feedback.mutate(
                  { id: shown.id, input: { rating: shown.feedback?.rating === 1 ? null : 1 } },
                  { onSuccess: (rec) => setCurrent(rec) },
                )
              }
            />
            <Chip
              label="👎"
              selected={shown.feedback?.rating === -1}
              onPress={() =>
                feedback.mutate(
                  { id: shown.id, input: { rating: shown.feedback?.rating === -1 ? null : -1 } },
                  { onSuccess: (rec) => setCurrent(rec) },
                )
              }
            />
          </View>
        </Card>
      ) : ctx.isLoading ? (
        <StateBlock kind="loading" />
      ) : null}
    </ScrollView>
  );
};

const FoodRestaurantMatches = ({
  foodId,
  foodName,
  lat,
  lng,
}: {
  foodId: string | null;
  foodName: string;
  lat: number | null;
  lng: number | null;
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const matches = useFoodRestaurants(
    foodId ?? '',
    {
      ...(lat !== null && lng !== null ? { lat, lng, radiusM: 5_000 } : {}),
      limit: 5,
    },
    { enabled: open && !!foodId },
  );

  if (!foodId) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({ pathname: '/(tabs)/restaurants', params: { q: foodName } } as never)
        }
        style={styles.eatBtn}
      >
        <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>이름으로 식당 검색</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.restaurantMatches}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={styles.eatBtn}
      >
        <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
          {open ? '파는 곳 접기' : '파는 곳 보기'}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.restaurantList}>
          {matches.isLoading ? (
            <View style={styles.busyInline}>
              <ActivityIndicator size="small" color={theme.colors.textMuted} />
              <Text style={styles.restaurantNotice}>식당을 찾는 중…</Text>
            </View>
          ) : matches.isError ? (
            <Pressable accessibilityRole="button" onPress={() => void matches.refetch()}>
              <Text style={[styles.restaurantNotice, { color: theme.colors.danger }]}>불러오지 못했어요 · 다시 시도</Text>
            </Pressable>
          ) : matches.data?.items.length ? (
            <>
              {matches.data.items.map((restaurant) => (
                <Pressable
                  key={restaurant.placeId}
                  accessibilityRole="button"
                  onPress={() => router.push(`/restaurant/${restaurant.placeId}` as never)}
                  style={[styles.restaurantRow, { borderColor: theme.colors.border }]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.restaurantName} numberOfLines={1}>{restaurant.name}</Text>
                    <Text style={styles.restaurantMeta} numberOfLines={1}>
                      {[
                        restaurant.distanceM !== null ? formatDistance(restaurant.distanceM) : null,
                        restaurant.category,
                        restaurant.mentionCount > 0 ? `리뷰 언급 ${restaurant.mentionCount}` : '메뉴 확인',
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={{ color: theme.colors.primary, fontSize: 12 }}>상세</Text>
                </Pressable>
              ))}
              <Text style={styles.restaurantNotice}>{matches.data.notice}</Text>
            </>
          ) : (
            <Text style={styles.restaurantNotice}>
              {lat !== null && lng !== null
                ? '반경 5km 안에서 연결된 식당을 찾지 못했어요.'
                : '수집된 메뉴·리뷰에서 연결된 식당을 찾지 못했어요.'}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
};

const formatDistance = (distanceM: number): string =>
  distanceM < 1_000 ? `${distanceM}m` : `${(distanceM / 1_000).toFixed(1)}km`;

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: 16, gap: 12, paddingBottom: 96 },
    note: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: theme.colors.text,
      fontSize: 14,
    },
    locationHint: { fontSize: 11, color: theme.colors.textMuted, lineHeight: 16 },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    primaryBtn: { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', minWidth: 110 },
    itemList: { gap: 10 },
    itemCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: 10,
      padding: 12,
      gap: 6,
    },
    itemHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    itemName: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
    itemMeta: { fontSize: 11, color: theme.colors.textMuted },
    itemReason: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },
    itemIngredients: { marginTop: 4, fontSize: 11, color: theme.colors.textMuted },
    itemActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    eatBtn: { paddingVertical: 6 },
    restaurantMatches: { flex: 1, minWidth: 0 },
    restaurantList: { gap: 6, paddingTop: 4 },
    busyInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    restaurantRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: 7,
    },
    restaurantName: { color: theme.colors.text, fontSize: 13, fontWeight: '600' },
    restaurantMeta: { color: theme.colors.textMuted, fontSize: 10, marginTop: 2 },
    restaurantNotice: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 14 },
    feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
    feedbackLabel: { fontSize: 12, color: theme.colors.textMuted, flex: 1 },
  });
