import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { MealEntryType } from '@repo/api-contract';
import {
  ApiError,
  useDeleteMealEntry,
  useMealDraftStore,
  useMealEntry,
  useTheme,
  type Theme,
} from '@repo/shared';
import { FOOD_CUISINE_LABEL, FOOD_DISH_TYPE_LABEL, FOOD_MAIN_INGREDIENT_LABEL, MEAL_PORTION_LABEL } from '@repo/utils';
import { Card, CardTitle, Note, StateBlock } from '~/components/common/Cards';
import { MealEntryCard } from '~/components/meal/MealEntryCard';
import { MealEntryEditor } from '~/components/meal/MealEntryEditor';
import { MealPhotoThumb } from '~/components/meal/MealPhotoThumb';

// 식단 상세 — 보기 / 수정 두 모드. 수정은 서버 기록을 draft 로 옮긴 뒤 같은 에디터를 쓴다.
export default function MealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const { data, isLoading, error, refetch } = useMealEntry(id);
  const remove = useDeleteMealEntry();
  const draft = useMealDraftStore();
  const [editing, setEditing] = useState(false);

  const startEdit = (entry: MealEntryType) => {
    draft.start({
      entryId: entry.id,
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
        isMain: it.isMain,
        confidence: it.confidence,
        source: it.source,
        candidates: [],
      })),
      recognition: null,
    });
    setEditing(true);
  };

  const confirmDelete = () => {
    Alert.alert('기록 삭제', '이 기록과 사진을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          remove.mutate(id, {
            onSuccess: () => router.back(),
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

          {data.photos.length > 0 ? (
            <Card>
              <CardTitle title="사진" />
              <View style={styles.photos}>
                {data.photos.map((p) => (
                  <MealPhotoThumb key={p.token} token={p.token} size={96} />
                ))}
              </View>
            </Card>
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
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            ))}
          </Card>

          {data.recognition?.model ? (
            <Note tone="muted">사진 인식: {data.recognition.model}</Note>
          ) : null}

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
    photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
    itemName: { flex: 1, fontSize: 14, color: theme.colors.text },
    itemMeta: { fontSize: 11, color: theme.colors.textMuted },
    actions: { flexDirection: 'row', gap: 10 },
    actionBtn: {
      flex: 1,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
  });
