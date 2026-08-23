import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { MealEntryType } from '@repo/api-contract';
import {
  ApiError,
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
  guessMealSlot,
  summarizeMealNutrition,
  toLocalDateKey,
} from '@repo/utils';
import { Card, CardTitle, Note, StateBlock } from '~/components/common/Cards';
import { MealEntryCard } from '~/components/meal/MealEntryCard';
import { MealEntryEditor } from '~/components/meal/MealEntryEditor';
import { MealPhotoGallery } from '~/components/meal/MealPhotoGallery';
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
    draft.start({
      entryId: entry.id,
      originRecommendationId: entry.originRecommendationId,
      eatenAt: entry.eatenAt,
      eatenDate: entry.eatenDate,
      slot: entry.slot,
      mealType: entry.mealType,
      placeId: entry.placeId,
      placeName: entry.placeName,
      memo: entry.memo ?? '',
      photos: entry.photos.map((p) => ({ token: p.token, localUri: null })),
      items: entry.items.map((it) => ({
        clientId: it.id,
        name: it.name,
        foodId: it.foodId,
        dishType: it.dishType,
        mainIngredient: it.mainIngredient,
        cuisine: it.cuisine,
        portion: it.portion,
        servings: it.servings,
        portionSource: it.portionSource,
        isMain: it.isMain,
        confidence: it.confidence,
        recognitionDishId: it.recognitionDishId,
        selectedCandidateRank: it.selectedCandidateRank,
        catalogMatchedBy: it.catalogMatchedBy,
        catalogMatchScore: it.catalogMatchScore,
        source: it.source,
        candidates: [],
        // 저장된 기록은 이미 한 번 확인한 값이다. 장소 힌트로 재인식해도 자동 교체하지 않는다.
        userEdited: true,
      })),
      recognition: null,
    });
    setEditing(true);
  };

  const repeatEntry = (entry: MealEntryType) => {
    const now = new Date();
    draft.start({
      eatenAt: now.toISOString(),
      eatenDate: toLocalDateKey(now),
      slot: guessMealSlot(now),
      mealType: entry.mealType,
      placeId: entry.placeId,
      placeName: entry.placeName,
      memo: '',
      photos: [],
      recognition: null,
      items: entry.items.map((item, index) => ({
        clientId: `repeat-${now.getTime()}-${index}`,
        name: item.name,
        foodId: item.foodId,
        dishType: item.dishType,
        mainIngredient: item.mainIngredient,
        cuisine: item.cuisine,
        portion: item.portion,
        servings: item.servings,
        portionSource: item.portionSource,
        isMain: item.isMain,
        confidence: null,
        source: item.foodId ? 'catalog' : 'manual',
        candidates: [],
        userEdited: true,
      })),
    });
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
        <Stack.Screen options={{ headerShown: true, title: '식단 수정' }} />
        <MealEntryEditor entryId={id} />
      </>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: '식단' }} />
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
              style={[styles.placeLink, { borderColor: theme.colors.border }]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.placeLabel}>기록한 식당</Text>
                <Text style={styles.placeName} numberOfLines={1}>{data.placeName ?? '식당 상세'}</Text>
              </View>
              <Text style={{ color: theme.colors.primary, fontSize: 13 }}>상세 보기</Text>
            </Pressable>
          ) : null}

          {data.photos.length > 0 ? (
            <Card>
              <CardTitle title="사진" />
              <MealPhotoGallery tokens={data.photos.map((photo) => photo.token)} />
            </Card>
          ) : data.photoPurgedAt ? (
            <Note tone="muted">보존 설정에 따라 사진은 {data.photoPurgedAt.slice(0, 10)}에 정리됐어요.</Note>
          ) : null}

          <Card>
            <CardTitle title="음식" sub={`${data.items.length}개`} />
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
                {it.nutritionBasis === 'donor_estimate' ? (
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
          </Card>

          {data.recognition?.model ? (
            <Note tone="muted">사진 인식: {data.recognition.model}</Note>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이 식단을 새 기록으로 복사"
            onPress={() => repeatEntry(data)}
            style={[styles.repeatBtn, { backgroundColor: theme.colors.primary }]}
          >
            <Text style={{ color: theme.colors.primaryText, fontSize: 15, fontWeight: '700' }}>
              이 식단 다시 기록
            </Text>
            <Text style={{ color: theme.colors.primaryText, fontSize: 10, opacity: 0.8 }}>
              음식·양·장소만 복사하고 사진과 메모는 제외해요
            </Text>
          </Pressable>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => startEdit(data)}
              style={[styles.actionBtn, { borderColor: theme.colors.border }]}
            >
              <Text style={{ color: theme.colors.text, fontSize: 15 }}>수정</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={confirmDelete}
              disabled={remove.isPending}
              style={[styles.actionBtn, { borderColor: theme.colors.danger, opacity: remove.isPending ? 0.6 : 1 }]}
            >
              <Text style={{ color: theme.colors.danger, fontSize: 15 }}>{remove.isPending ? '삭제 중…' : '삭제'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { padding: 16, gap: 12 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
    itemName: { flex: 1, fontSize: 14, color: theme.colors.text },
    itemMeta: { fontSize: 11, color: theme.colors.textMuted },
    itemEstimate: { fontSize: 10, color: theme.colors.textMuted, fontStyle: 'italic' },
    nutritionRow: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
    nutritionMain: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
    nutritionNote: { marginTop: 3, fontSize: 11, color: theme.colors.textMuted },
    actions: { flexDirection: 'row', gap: 10 },
    repeatBtn: { borderRadius: 10, paddingVertical: 11, alignItems: 'center', gap: 2 },
    placeLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 10,
      padding: 12,
    },
    placeLabel: { color: theme.colors.textMuted, fontSize: 10 },
    placeName: { color: theme.colors.text, fontSize: 14, fontWeight: '600', marginTop: 2 },
    actionBtn: {
      flex: 1,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
  });
