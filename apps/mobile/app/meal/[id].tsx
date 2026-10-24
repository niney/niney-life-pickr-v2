import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { MealEntryType } from '@repo/api-contract';
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
  mealDateTitle,
  summarizeMealNutrition,
  toLocalDateKey,
} from '@repo/utils';
import { Note, StateBlock } from '~/components/common/Cards';
import { MealEntryCard } from '~/components/meal/MealEntryCard';
import { MealEntryEditor } from '~/components/meal/MealEntryEditor';
import { MealPhotoGallery } from '~/components/meal/MealPhotoGallery';
import { MealSection, MealSectionTitle } from '~/components/meal/mealUi';
import { mealFont, mealRadius } from '~/components/meal/mealTokens';
import { invalidateMealPhotoFiles } from '~/lib/mealPhotoCache';

// 식단 상세 — 보기 / 수정 두 모드. 수정은 서버 기록을 draft 로 옮긴 뒤 같은 에디터를 쓴다.
export default function MealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const router = useRouter();
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

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{ headerShown: true, title: '식단', headerStyle: { backgroundColor: theme.colors.bgGrouped } }}
      />
      {isLoading ? (
        <StateBlock kind="loading" />
      ) : error || !data ? (
        <StateBlock kind="error" message="기록을 불러오지 못했습니다." onRetry={() => void refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <MealEntryCard entry={data} />

          {data.placeId ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push(`/restaurant/${data.placeId}` as never)}
              style={({ pressed }) => [styles.placeLink, { opacity: pressed ? 0.75 : 1 }]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.placeLabel}>기록한 식당</Text>
                <Text style={styles.placeName} numberOfLines={1}>{data.placeName ?? '식당 상세'}</Text>
              </View>
              <Text style={{ color: theme.colors.textMuted, fontSize: mealFont.footnote }}>상세 보기</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}

          {data.photos.length > 0 ? (
            <MealSection>
              <MealSectionTitle title="사진" />
              <MealPhotoGallery tokens={data.photos.map((photo) => photo.token)} />
            </MealSection>
          ) : data.photoPurgedAt ? (
            <Note tone="muted">
              보존 설정에 따라 사진은 {mealDateTitle(toLocalDateKey(new Date(data.photoPurgedAt)), toLocalDateKey(new Date()))}에
              정리됐어요.
            </Note>
          ) : null}

          <MealSection>
            <MealSectionTitle title="음식" sub={`${data.items.length}개`} />
            {data.items.map((it) => (
              <View key={it.id} style={styles.itemRow}>
                <Text style={styles.itemName}>
                  {it.isMain ? '' : '· '}
                  {it.name}
                </Text>
                <Text style={styles.itemMeta}>
                  {[
                    it.dishType ? FOOD_DISH_TYPE_LABEL[it.dishType] : null,
                    it.mainIngredient ? FOOD_MAIN_INGREDIENT_LABEL[it.mainIngredient] : null,
                    it.cuisine ? FOOD_CUISINE_LABEL[it.cuisine] : null,
                    it.portion ? MEAL_PORTION_LABEL[it.portion] : null,
                    it.servings !== null ? `${it.servings}인분(직접 입력)` : null,
                    // 영양은 있을 때만 붙인다. 빌려온 값이면 어디서 왔는지까지 밝힌다.
                    it.kcal !== null ? `${Math.round(it.kcal)}kcal` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {it.nutritionBasis === 'donor_estimate' || it.nutritionBasis === 'typical_portion' ? (
                  <Text style={styles.itemEstimate}>{it.nutritionFrom ?? '유사 음식'} 기준 추정</Text>
                ) : it.nutritionBasis === 'missing' ? (
                  <Text style={styles.itemEstimate}>공개된 영양 근거 없음</Text>
                ) : null}
              </View>
            ))}
            {nutrition.kcal !== null ? (
              <View style={styles.nutritionRow}>
                <Text style={styles.nutritionMain}>
                  약 {nutrition.kcal.toLocaleString('ko-KR')}kcal
                  {nutrition.proteinG ? ` · 단백질 ${nutrition.proteinG}g` : ''}
                  {nutrition.sodiumMg ? ` · 나트륨 ${nutrition.sodiumMg.toLocaleString('ko-KR')}mg` : ''}
                </Text>
                {nutrition.counted < nutrition.total ? (
                  <Text style={styles.nutritionNote}>
                    {nutrition.total}개 중 {nutrition.counted}개만 반영 — 나머지는 공개된 영양 정보가 없어요.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </MealSection>

          {data.recognition?.model ? (
            <Note tone="muted">사진 인식: {data.recognition.model}</Note>
          ) : null}

          {/* 수정이 기본 동작 — "다시 기록"을 수정으로 읽고 눌러 새 기록이 생긴 일이 있어(2026-10-02, 웹과 같이)
              새로 만드는 버튼은 이름에 '새 기록'을 넣고 보조 버튼으로 뒤에 둔다. */}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => startEdit(data)}
              style={[
                styles.actionBtn,
                { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
              ]}
            >
              <Text style={{ color: theme.colors.primaryText, fontSize: mealFont.body, fontWeight: '700' }}>수정</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={confirmDelete}
              disabled={remove.isPending}
              style={[styles.actionBtn, { borderColor: theme.colors.danger, opacity: remove.isPending ? 0.6 : 1 }]}
            >
              <Text style={{ color: theme.colors.danger, fontSize: mealFont.body }}>{remove.isPending ? '삭제 중…' : '삭제'}</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="같은 메뉴로 새 기록 만들기"
            onPress={() => repeatEntry(data)}
            style={({ pressed }) => [styles.repeatBtn, { opacity: pressed ? 0.75 : 1 }]}
          >
            <Text style={{ color: theme.colors.text, fontSize: mealFont.body, fontWeight: '600' }}>
              같은 메뉴로 새 기록
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: mealFont.caption }}>
              음식·양·장소만 지금 시각의 새 기록으로 복사해요(사진·메모 제외)
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bgGrouped },
    content: { padding: 16, gap: 12 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
    itemName: { flex: 1, fontSize: mealFont.body, color: theme.colors.text },
    itemMeta: { fontSize: mealFont.caption, color: theme.colors.textMuted },
    itemEstimate: { fontSize: mealFont.caption, color: theme.colors.textMuted },
    nutritionRow: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
    nutritionMain: { fontSize: mealFont.callout, color: theme.colors.text, fontWeight: '700' },
    nutritionNote: { marginTop: 3, fontSize: mealFont.caption, color: theme.colors.textMuted },
    actions: { flexDirection: 'row', gap: 10 },
    repeatBtn: {
      borderRadius: mealRadius.control,
      backgroundColor: theme.colors.surface,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
      gap: 2,
    },
    placeLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.colors.surface,
      borderRadius: mealRadius.card,
      paddingVertical: 12,
      paddingLeft: 16,
      paddingRight: 10,
    },
    placeLabel: { color: theme.colors.textMuted, fontSize: mealFont.caption },
    placeName: { color: theme.colors.text, fontSize: mealFont.callout, fontWeight: '600', marginTop: 2 },
    actionBtn: {
      flex: 1,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: mealRadius.control,
      backgroundColor: theme.colors.surface,
      paddingVertical: 13,
      alignItems: 'center',
    },
  });
