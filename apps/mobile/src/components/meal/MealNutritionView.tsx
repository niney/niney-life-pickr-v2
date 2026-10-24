import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type {
  MealNutrientResultType,
  MealNutritionAdviceType,
  MealNutritionAnalysisType,
} from '@repo/api-contract';
import {
  useCreateMealNutritionAdvice,
  useLatestMealNutritionAdvice,
  useMealNutrition,
  useTheme,
  type Theme,
} from '@repo/shared';
import {
  MEAL_NUTRIENT_REFERENCE_LABEL,
  MEAL_NUTRIENT_STATUS_LABEL,
  MEAL_NUTRIENT_STATUS_ORDER,
  NUTRIENT_BAR_MAX_PERCENT,
  formatNutrientAmount,
  mealNutrientProfileLabel,
  mealDateTitle,
  nutrientBarWidth,
  toLocalDateKey,
} from '@repo/utils';
import { Note, StateBlock } from '~/components/common/Cards';
import { Chip, ChipRow, MealSection, MealSectionTitle } from './mealUi';
import { mealFont, mealRadius, useMealFabInsets } from './mealTokens';

// 영양 — 웹 MealNutritionTab 과 같은 구성. 최근 기록의 하루 평균을 한국인 영양소 섭취기준(2020)과 견주고(서버 계산),
// 모자란 영양소를 음식·영양제(성분·형태, 제품명 없음)로 채우는 조언을 받는다. 조언은 LLM 이라 누를 때만 만들고,
// 같은 날·같은 기록이면 서버가 저장본을 준다("다시 쓰기"만 새로). 막대는 View 폭 계산으로 그린다.

const PERIODS = [7, 14, 28] as const;
type Period = (typeof PERIODS)[number];

const STATUS_COLOR: Record<MealNutrientResultType['status'], string> = {
  low: '#ef4444',
  borderline: '#f59e0b',
  ok: '#10b981',
  high: '#f97316',
  unknown: '#a1a1aa',
};

const amount = (v: number, unit: string) => `${formatNutrientAmount(v)}${unit}`;

const adviceSourceLabel = (advice: MealNutritionAdviceType): string =>
  advice.status === 'insufficient'
    ? '기록 부족'
    : advice.status === 'fallback'
      ? 'AI 없이 계산으로 쓴 조언'
      : advice.model
        ? 'AI 조언'
        : '계산 결과';

export const MealNutritionView = () => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { contentBottom } = useMealFabInsets();
  const [days, setDays] = useState<Period>(14);
  const analysis = useMealNutrition(days);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: contentBottom }]}
      showsVerticalScrollIndicator={false}
    >
      <ChipRow>
        {PERIODS.map((d) => (
          <Chip key={d} label={`${d}일`} selected={days === d} onPress={() => setDays(d)} />
        ))}
      </ChipRow>

      <MealSection>
        <MealSectionTitle
          title="영양소 점검"
          sub="두 끼 이상 기록한 날의 하루 평균을 한국인 영양소 섭취기준(2020)과 견줘요."
        />
        {analysis.isLoading ? (
          <StateBlock kind="loading" />
        ) : analysis.error || !analysis.data ? (
          <StateBlock
            kind="error"
            message="영양소 점검을 불러오지 못했어요."
            onRetry={() => void analysis.refetch()}
            retrying={analysis.isFetching}
          />
        ) : (
          <AnalysisBody data={analysis.data} styles={styles} />
        )}
      </MealSection>

      <AdviceCard days={days} ready={analysis.data?.status === 'ok'} styles={styles} />
    </ScrollView>
  );
};

type Styles = ReturnType<typeof createStyles>;

const AnalysisBody = ({ data, styles }: { data: MealNutritionAnalysisType; styles: Styles }) => {
  if (data.status === 'insufficient') {
    return <Note tone="muted">{data.insufficientReason ?? '기록이 더 쌓이면 볼 수 있어요.'}</Note>;
  }
  const sorted = [...data.nutrients].sort(
    (a, b) => MEAL_NUTRIENT_STATUS_ORDER[a.status] - MEAL_NUTRIENT_STATUS_ORDER[b.status],
  );
  return (
    <View style={styles.body}>
      <Text style={styles.meta}>
        최근 {data.days}일 중 {data.analyzedDays}일 · 끼니 {data.mealCount}개 ·{' '}
        {mealNutrientProfileLabel(data.profile)}
        {data.energy.intakePerDay !== null
          ? `\n하루 평균 ${formatNutrientAmount(data.energy.intakePerDay)}kcal (필요량 ${formatNutrientAmount(data.energy.requirement)}kcal의 ${data.energy.percent}%)`
          : ''}
      </Text>
      {data.notes.map((note) => (
        <Note key={note} tone="warn">
          {note}
        </Note>
      ))}
      {sorted.map((n) => (
        <NutrientRow key={n.key} n={n} styles={styles} />
      ))}
      <Text style={styles.small}>식단 데이터에 값이 없어 판단하지 않는 영양소: {data.notMeasured.join(', ')}</Text>
    </View>
  );
};

const NutrientRow = ({ n, styles }: { n: MealNutrientResultType; styles: Styles }) => {
  const color = STATUS_COLOR[n.status];
  const short = n.status === 'low' || n.status === 'borderline';
  return (
    <View style={styles.row} accessibilityLabel={`${n.label} ${MEAL_NUTRIENT_STATUS_LABEL[n.status]}`}>
      <View style={styles.rowHead}>
        <Text style={styles.rowLabel}>{n.label}</Text>
        <View style={[styles.badge, { backgroundColor: `${color}22` }]}>
          <Text style={[styles.badgeText, { color }]}>{MEAL_NUTRIENT_STATUS_LABEL[n.status]}</Text>
        </View>
        <Text style={styles.rowValue}>
          {n.intakePerDay !== null ? amount(n.intakePerDay, n.unit) : '-'} / {amount(n.reference.amount, n.unit)}
          {n.percent !== null ? ` (${n.percent}%)` : ''}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${nutrientBarWidth(n.percent)}%`, backgroundColor: color }]} />
        <View style={[styles.refLine, { left: `${(100 / NUTRIENT_BAR_MAX_PERCENT) * 100}%` }]} />
      </View>
      <Text style={styles.small}>
        {MEAL_NUTRIENT_REFERENCE_LABEL[n.reference.kind]} 기준
        {n.note ? ` · ${n.note}` : ''}
      </Text>
      {short && (n.foodSuggestions.length > 0 || n.typicalFoods.length > 0) ? (
        <Text style={styles.small}>
          {n.foodSuggestions.length > 0 ? `한 끼로는 ${n.foodSuggestions.join('·')} · ` : ''}많이 든 음식:{' '}
          {n.typicalFoods.join(', ')}
        </Text>
      ) : null}
    </View>
  );
};

const AdviceCard = ({ days, ready, styles }: { days: Period; ready: boolean; styles: Styles }) => {
  const theme = useTheme();
  const latest = useLatestMealNutritionAdvice();
  const create = useCreateMealNutritionAdvice();
  const advice = latest.data?.advice ?? null;
  const request = (force: boolean) => create.mutate({ days, force });

  return (
    <MealSection>
      <MealSectionTitle
        title="나에게 맞는 영양제"
        sub="모자란 영양소를 음식으로 먼저 채우는 법과, 영양제를 고른다면 어떤 성분·형태가 좋은지 알려 드려요. 제품은 추천하지 않아요."
      />
      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: create.isPending || !ready }}
          onPress={() => request(false)}
          disabled={create.isPending || !ready}
          style={[
            styles.primaryBtn,
            { backgroundColor: theme.colors.primary, opacity: create.isPending || !ready ? 0.5 : 1 },
          ]}
        >
          {create.isPending ? (
            <ActivityIndicator size="small" color={theme.colors.primaryText} />
          ) : (
            <Text style={[styles.primaryBtnText, { color: theme.colors.primaryText }]}>
              최근 {days}일로 조언 받기
            </Text>
          )}
        </Pressable>
        {advice ? <Chip label="다시 쓰기" onPress={() => request(true)} disabled={create.isPending || !ready} /> : null}
      </View>
      {!ready ? (
        <Text style={styles.small}>기록이 더 쌓이면 조언을 받을 수 있어요.</Text>
      ) : create.isPending ? (
        <Text style={styles.small}>AI가 기록을 읽고 있어요. 20초쯤 걸릴 수 있어요.</Text>
      ) : null}
      {create.error ? (
        <Note tone="warn">{create.error instanceof Error ? create.error.message : '조언을 받지 못했어요.'}</Note>
      ) : null}
      {latest.isLoading ? <StateBlock kind="loading" /> : advice ? <AdviceBody advice={advice} styles={styles} /> : null}
    </MealSection>
  );
};

const AdviceBody = ({ advice, styles }: { advice: MealNutritionAdviceType; styles: Styles }) => {
  const picks = advice.items.filter((i) => i.supplementTip !== null);
  return (
    <View style={styles.body}>
      <Text style={styles.small}>
        {mealDateTitle(advice.targetDate, toLocalDateKey(new Date()))} · 최근 {advice.analysis.days}일 기록 기준 · {adviceSourceLabel(advice)}
      </Text>
      <Text style={styles.summary}>{advice.summary}</Text>
      {picks.length > 0 ? (
        <View style={styles.pickRow}>
          <Text style={styles.small}>영양제로 채운다면</Text>
          {picks.map((i) => (
            <View key={i.nutrient} style={styles.pick}>
              <Text style={styles.pickText}>{i.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {advice.items.map((item) => (
        <View key={item.nutrient} style={styles.item}>
          <View style={styles.rowHead}>
            <Text style={styles.itemTitle}>{item.label}</Text>
            {item.shortfallPerDay !== null && item.shortfallPerDay > 0 ? (
              <Text style={styles.small}>하루 약 {amount(item.shortfallPerDay, item.unit)} 모자람</Text>
            ) : null}
          </View>
          <Text style={styles.itemText}>{item.reason}</Text>
          <AdviceLine label="음식으로" text={item.foodTip} styles={styles} />
          {item.supplementTip ? <AdviceLine label="영양제로" text={item.supplementTip} styles={styles} /> : null}
          <Note tone="muted">{item.caution}</Note>
        </View>
      ))}
      <Text style={styles.small}>{advice.disclaimer}</Text>
    </View>
  );
};

const AdviceLine = ({ label, text, styles }: { label: string; text: string; styles: Styles }) => (
  <View style={styles.adviceLine}>
    <Text style={styles.adviceLabel}>{label}</Text>
    <Text style={styles.adviceText}>{text}</Text>
  </View>
);

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: 16, gap: 12 },
    body: { gap: 12 },
    meta: { fontSize: mealFont.callout, lineHeight: 20, color: theme.colors.text },
    small: { fontSize: mealFont.caption, lineHeight: 17, color: theme.colors.textMuted },
    row: { gap: 5 },
    rowHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    rowLabel: { fontSize: mealFont.body, fontWeight: '600', color: theme.colors.text },
    rowValue: {
      marginLeft: 'auto',
      fontSize: mealFont.caption,
      color: theme.colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    badge: { borderRadius: mealRadius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    badgeText: { fontSize: mealFont.caption, fontWeight: '600' },
    track: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.colors.surfaceAlt },
    fill: { height: 8, borderRadius: 4 },
    refLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: theme.colors.textMuted },
    actionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    primaryBtn: {
      borderRadius: mealRadius.control,
      paddingHorizontal: 18,
      paddingVertical: 12,
      minWidth: 150,
      alignItems: 'center',
    },
    primaryBtnText: { fontSize: mealFont.body, fontWeight: '700' },
    summary: { fontSize: mealFont.body, lineHeight: 22, color: theme.colors.text },
    pickRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    pick: {
      borderRadius: mealRadius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.primary,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    pickText: { fontSize: mealFont.caption, fontWeight: '600', color: theme.colors.text },
    item: {
      gap: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: mealRadius.control,
      padding: 12,
    },
    itemTitle: { fontSize: mealFont.body, fontWeight: '700', color: theme.colors.text, flex: 1 },
    itemText: { fontSize: mealFont.callout, lineHeight: 20, color: theme.colors.text },
    adviceLine: { flexDirection: 'row', gap: 8 },
    adviceLabel: {
      fontSize: mealFont.caption,
      fontWeight: '700',
      color: theme.colors.primary,
      paddingTop: 2,
      width: 52,
    },
    adviceText: { flex: 1, fontSize: mealFont.callout, lineHeight: 20, color: theme.colors.textMuted },
  });
