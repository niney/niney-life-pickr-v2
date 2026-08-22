import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { MealRecommendationType, MealSlotType, MealTypeType } from '@repo/api-contract';
import {
  ApiError,
  useCreateMealRecommendation,
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
  const [mealType, setMealType] = useState<MealTypeType | null>(null);
  const [note, setNote] = useState('');
  const [current, setCurrent] = useState<MealRecommendationType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ctx = useMealRecommendationContext();
  const create = useCreateMealRecommendation();
  const feedback = useMealRecommendationFeedback();

  const shown = current ?? ctx.data?.latest ?? null;

  const request = (force: boolean) => {
    setError(null);
    create.mutate(
      {
        targetDate: toLocalDateKey(new Date()),
        targetSlot: slot,
        mealType,
        note: note.trim() ? note.trim() : null,
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
      mealType,
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
    feedback.mutate({ id: rec.id, input: { pickedName: name } });
    router.push('/meal/new' as never);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card>
        <CardTitle title="다음 끼니 추천" sub="기록을 보고 겹치지 않게 골라 드려요" />

        <FieldLabel>끼니</FieldLabel>
        <ChipRow>
          {MEAL_SLOTS.map((s) => (
            <Chip key={s} label={MEAL_SLOT_LABEL[s]} selected={slot === s} onPress={() => setSlot(s)} />
          ))}
        </ChipRow>

        <FieldLabel>상황</FieldLabel>
        <ChipRow>
          {MEAL_TYPES.map((t) => (
            <Chip
              key={t}
              label={MEAL_TYPE_LABEL[t]}
              selected={mealType === t}
              onPress={() => setMealType(mealType === t ? null : t)}
            />
          ))}
        </ChipRow>

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
                    {/* 파는 곳 — 맛집 탭 검색으로 넘긴다(서버 쪽 메뉴→식당 매칭은 아직 없다). */}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.push({ pathname: '/(tabs)/restaurants', params: { q: item.name } } as never)}
                      style={styles.eatBtn}
                    >
                      <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>파는 곳 찾기</Text>
                    </Pressable>
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
    feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
    feedbackLabel: { fontSize: 12, color: theme.colors.textMuted, flex: 1 },
  });
