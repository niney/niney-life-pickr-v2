import { useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { MealEntryType, MealSlotType } from '@repo/api-contract';
import {
  ApiError,
  mealDraftInitForRepeat,
  mealDraftInitFromEntry,
  useAuthStore,
  useDeleteMealEntry,
  useMealDraftStore,
  useMealEntry,
  useTheme,
  type Theme,
} from '@repo/shared';
import {
  FOOD_CUISINE_LABEL,
  FOOD_DISH_TYPE_LABEL,
  FOOD_MAIN_INGREDIENT_LABEL,
  MEAL_PORTION_LABEL,
  MEAL_SLOT_LABEL,
  MEAL_TYPE_LABEL,
  daysBetween,
  mealDateLabel,
  mealDateTitle,
  mealNutritionLabel,
  summarizeMealNutrition,
  toLocalDateKey,
} from '@repo/utils';
import { Note, StateBlock } from '~/components/common/Cards';
import { MealEntryEditor } from '~/components/meal/MealEntryEditor';
import { MealPhotoGallery } from '~/components/meal/MealPhotoGallery';
import { MealSection, MealSectionTitle, StatTile, type MealIconName } from '~/components/meal/mealUi';
import { mealFont, mealRadius } from '~/components/meal/mealTokens';
import { invalidateMealPhotoFiles } from '~/lib/mealPhotoCache';

// 식단 상세 — 보기 / 수정 두 모드. 수정은 서버 기록을 draft 로 옮긴 뒤 같은 에디터를 쓴다.
//
// 보기: 맨 위 화면 폭 큰 사진(있을 때) → 요약(음식·끼니·시각·장소·메모) → 영양 타일 → 음식 목록.
// '수정'은 헤더 오른쪽 버튼, '같은 메뉴로 새 기록'·'삭제'는 옆 '…' 액션 시트에 둔다(본문 큰 버튼 셋을 걷었다).

const SLOT_ICON: Record<MealSlotType, MealIconName> = {
  breakfast: 'weather-sunset-up',
  lunch: 'white-balance-sunny',
  dinner: 'weather-night',
  snack: 'cookie-outline',
  late_night: 'moon-waning-crescent',
};

const timeText = (iso: string): string => {
  const d = new Date(iso);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
};
export default function MealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error, refetch } = useMealEntry(id);
  const remove = useDeleteMealEntry();
  const authToken = useAuthStore((state) => state.token);
  const draft = useMealDraftStore();
  const [editing, setEditing] = useState(false);
  // 영양은 값이 있는 항목만 더한 합계다(카탈로그 커버리지가 100% 가 아니다) — 몇 개가 반영됐는지 같이 보여 준다.
  const nutrition = useMemo(() => summarizeMealNutrition(data?.items ?? []), [data?.items]);

  const startEdit = (entry: MealEntryType) => {
    draft.start(mealDraftInitFromEntry(entry));
    setEditing(true);
  };

  const repeatEntry = (entry: MealEntryType) => {
    draft.start(mealDraftInitForRepeat(entry, new Date()));
    router.push('/meal/new' as never);
  };

  // '…' — 같은 메뉴로 새 기록 / 삭제. 삭제는 시트에서 고른 뒤에도 한 번 더 묻는다(사진까지 지워진다).
  const openMore = (entry: MealEntryType) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['같은 메뉴로 새 기록', '기록 삭제', '취소'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
          message: '새 기록은 음식·양·장소만 지금 시각으로 복사해요.',
        },
        (index) => {
          if (index === 0) repeatEntry(entry);
          else if (index === 1) confirmDelete();
        },
      );
      return;
    }
    Alert.alert('기록', undefined, [
      { text: '같은 메뉴로 새 기록', onPress: () => repeatEntry(entry) },
      { text: '기록 삭제', style: 'destructive', onPress: confirmDelete },
      { text: '취소', style: 'cancel' },
    ]);
  };

  const confirmDelete = () => {
    Alert.alert('기록 삭제', '이 기록과 사진을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          remove.mutate(id, {
            onSuccess: () => {
              if (authToken && data) {
                void invalidateMealPhotoFiles(
                  authToken,
                  data.photos.map((photo) => photo.token),
                );
              }
              router.back();
            },
            onError: (e) => Alert.alert('삭제 실패', e instanceof ApiError ? e.message : '다시 시도해 주세요.'),
          });
        },
      },
    ]);
  };

  if (editing) {
    return (
      <>
        <Stack.Screen
          options={{ headerShown: true, title: '식단 수정', headerStyle: { backgroundColor: theme.colors.bgGrouped } }}
        />
        <MealEntryEditor entryId={id} />
      </>
    );
  }

  const today = toLocalDateKey(new Date());
  const mains = data?.items.filter((i) => i.isMain) ?? [];
  const sides = data?.items.filter((i) => !i.isMain) ?? [];
  const titleItems = mains.length > 0 ? mains : sides;
  const subItems = mains.length > 0 ? sides : [];
  // 목록 카드와 같은 기준으로 합계를 숨긴다(주식이 있는데 곁들임만 반영된 합계 등).
  const kcalShown = mealNutritionLabel(nutrition) !== null ? nutrition.kcal : null;
  const dayDiff = data ? daysBetween(data.eatenDate, today) : null;
  const dayText = data
    ? dayDiff !== null && dayDiff >= 0 && dayDiff <= 6
      ? `${mealDateLabel(data.eatenDate, today)} · ${mealDateTitle(data.eatenDate, today)}`
      : mealDateTitle(data.eatenDate, today)
    : '';

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '식단',
          headerStyle: { backgroundColor: theme.colors.bgGrouped },
          headerRight: data
            ? () => (
                <View style={styles.headerActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="기록 수정"
                    onPress={() => startEdit(data)}
                    hitSlop={6}
                    style={({ pressed }) => [styles.headerButton, { opacity: pressed ? 0.5 : 1 }]}
                  >
                    <Text style={styles.headerEdit}>수정</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="더보기"
                    onPress={() => openMore(data)}
                    disabled={remove.isPending}
                    hitSlop={6}
                    style={({ pressed }) => [styles.headerButton, { opacity: pressed ? 0.5 : 1 }]}
                  >
                    <MaterialCommunityIcons name="dots-horizontal-circle-outline" size={24} color={theme.colors.text} />
                  </Pressable>
                </View>
              )
            : undefined,
        }}
      />
      {isLoading ? (
        <StateBlock kind="loading" />
      ) : error || !data ? (
        <StateBlock kind="error" message="기록을 불러오지 못했습니다." onRetry={() => void refetch()} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {data.photos.length > 0 ? (
            <MealPhotoGallery tokens={data.photos.map((photo) => photo.token)} variant="hero" />
          ) : null}

          <View style={styles.content}>
            <MealSection>
              <View style={styles.metaRow}>
                <View style={[styles.slotBadge, { backgroundColor: `${theme.colors.primary}1f` }]}>
                  <MaterialCommunityIcons name={SLOT_ICON[data.slot]} size={15} color={theme.colors.primary} />
                  <Text style={styles.slotText}>{MEAL_SLOT_LABEL[data.slot]}</Text>
                </View>
                <Text style={styles.metaText} numberOfLines={1}>
                  {[dayText, timeText(data.eatenAt), data.mealType ? MEAL_TYPE_LABEL[data.mealType] : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <View style={styles.titleBlock}>
                <Text style={styles.title}>{titleItems.map((i) => i.name).join(', ') || '(음식 없음)'}</Text>
                {subItems.length > 0 ? (
                  <Text style={styles.subTitle}>+ {subItems.map((i) => i.name).join(', ')}</Text>
                ) : null}
              </View>
              {data.memo ? <Text style={styles.memo}>{data.memo}</Text> : null}
              {data.placeName ? (
                <Pressable
                  accessibilityRole={data.placeId ? 'link' : undefined}
                  accessibilityLabel={data.placeId ? `${data.placeName} 식당 상세` : data.placeName}
                  onPress={data.placeId ? () => router.push(`/restaurant/${data.placeId}` as never) : undefined}
                  disabled={!data.placeId}
                  style={({ pressed }) => [
                    styles.placeRow,
                    { backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.75 : 1 },
                  ]}
                >
                  <MaterialCommunityIcons name="map-marker-outline" size={18} color={theme.colors.textMuted} />
                  <Text style={styles.placeName} numberOfLines={1}>
                    {data.placeName}
                  </Text>
                  {data.placeId ? (
                    <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
                  ) : null}
                </Pressable>
              ) : null}
            </MealSection>

            {data.photos.length === 0 && data.photoPurgedAt ? (
              <Note tone="muted">
                보존 설정에 따라 사진은 {mealDateTitle(toLocalDateKey(new Date(data.photoPurgedAt)), today)}에
                정리됐어요.
              </Note>
            ) : null}

            {kcalShown !== null ? (
              <MealSection>
                <MealSectionTitle
                  title="영양"
                  sub={
                    nutrition.counted < nutrition.total
                      ? `${nutrition.total}개 중 ${nutrition.counted}개만 반영 — 나머지는 공개된 영양 정보가 없어요.`
                      : nutrition.hasEstimate
                        ? '일부는 비슷한 음식·통상 1인분으로 추정한 값이에요.'
                        : null
                  }
                />
                {/* 세 칸을 한 줄에 — 기본 타일(반 폭)이면 2+1 로 줄바꿈된다. */}
                <View style={styles.tiles}>
                  <StatTile
                    icon="fire"
                    label="열량"
                    value={`${kcalShown.toLocaleString('ko-KR')}kcal`}
                    style={styles.tile}
                  />
                  {nutrition.proteinG ? (
                    <StatTile
                      icon="food-drumstick-outline"
                      label="단백질"
                      value={`${nutrition.proteinG}g`}
                      style={styles.tile}
                    />
                  ) : null}
                  {nutrition.sodiumMg ? (
                    <StatTile
                      icon="shaker-outline"
                      label="나트륨"
                      value={`${nutrition.sodiumMg.toLocaleString('ko-KR')}mg`}
                      style={styles.tile}
                    />
                  ) : null}
                </View>
              </MealSection>
            ) : null}

            <MealSection>
              <MealSectionTitle title="음식" sub={`${data.items.length}개`} />
              <View>
                {data.items.map((it, index) => {
                  const meta = [
                    it.isMain ? '주식' : '곁들임',
                    it.dishType ? FOOD_DISH_TYPE_LABEL[it.dishType] : null,
                    it.mainIngredient ? FOOD_MAIN_INGREDIENT_LABEL[it.mainIngredient] : null,
                    it.cuisine ? FOOD_CUISINE_LABEL[it.cuisine] : null,
                    it.portion ? MEAL_PORTION_LABEL[it.portion] : null,
                    it.servings !== null ? `${it.servings}인분(직접 입력)` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  // 영양은 있을 때만 붙인다. 빌려온 값이면 어디서 왔는지까지 밝힌다.
                  const basis =
                    it.nutritionBasis === 'donor_estimate' || it.nutritionBasis === 'typical_portion'
                      ? `${it.nutritionFrom ?? '유사 음식'} 기준 추정`
                      : it.nutritionBasis === 'missing'
                        ? '공개된 영양 근거 없음'
                        : null;
                  return (
                    <View key={it.id} style={[styles.itemRow, index > 0 ? styles.itemDivider : null]}>
                      <View style={styles.itemBody}>
                        <Text style={styles.itemName}>{it.name}</Text>
                        <Text style={styles.itemMeta}>{meta}</Text>
                        {basis ? <Text style={styles.itemMeta}>{basis}</Text> : null}
                      </View>
                      {it.kcal !== null ? <Text style={styles.itemKcal}>{Math.round(it.kcal)}kcal</Text> : null}
                    </View>
                  );
                })}
              </View>
            </MealSection>

            {data.recognition?.model ? (
              <Text style={styles.footnote}>사진을 AI 로 인식해 남긴 기록이에요.</Text>
            ) : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bgGrouped },
    content: { padding: 16, gap: 12 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerButton: { padding: 6 },
    headerEdit: { color: theme.colors.primary, fontSize: mealFont.body, fontWeight: '700' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    slotBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: mealRadius.pill,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    slotText: { color: theme.colors.primary, fontSize: mealFont.caption, fontWeight: '700' },
    metaText: { flex: 1, color: theme.colors.textMuted, fontSize: mealFont.footnote },
    titleBlock: { gap: 4 },
    title: { color: theme.colors.text, fontSize: mealFont.title, lineHeight: 26, fontWeight: '700' },
    subTitle: { color: theme.colors.textMuted, fontSize: mealFont.callout },
    memo: { color: theme.colors.text, fontSize: mealFont.callout, lineHeight: 20 },
    placeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: mealRadius.control,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    placeName: { flex: 1, color: theme.colors.text, fontSize: mealFont.callout, fontWeight: '600' },
    tiles: { flexDirection: 'row', gap: 8 },
    tile: { minWidth: 0 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    itemDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
    itemBody: { flex: 1, minWidth: 0, gap: 2 },
    itemName: { color: theme.colors.text, fontSize: mealFont.body, fontWeight: '600' },
    itemMeta: { color: theme.colors.textMuted, fontSize: mealFont.caption, lineHeight: 16 },
    itemKcal: {
      color: theme.colors.text,
      fontSize: mealFont.callout,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    footnote: { color: theme.colors.textMuted, fontSize: mealFont.caption, textAlign: 'center' },
  });
