import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SegmentedControl, useMealStats, useTheme, type Theme } from '@repo/shared';
import { mealDateLabel, mealDateTitle, toLocalDateKey } from '@repo/utils';
import { StateBlock } from '~/components/common/Cards';
import { BarRow, MealSection, MealSectionTitle, StatTile } from './mealUi';
import { mealFont, mealRadius } from './mealTokens';

// 통계 — 분석 탭(MealAnalysisView)의 섹션들. 기간(1주/1달/3달)은 분석 탭이 들고 있고,
// 위쪽(한눈에·주간 인사이트)과 아래쪽(분포·자주 먹은 음식·날짜별·추천 반응)이 같은 기간을 본다.
// 두 조각이 같은 쿼리 키로 useMealStats 를 불러 요청은 한 번이다.
// 차트 라이브러리를 쓰지 않는 리포 관례대로 View 폭 계산 막대로만 그린다.

const MEAL_STATS_RANGES = [
  { value: '7', label: '1주', days: 7 },
  { value: '30', label: '1달', days: 30 },
  { value: '90', label: '3달', days: 90 },
] as const;
export type MealStatsRangeKey = (typeof MEAL_STATS_RANGES)[number]['value'];

const shift = (days: number): { from: string; to: string } => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return { from: toLocalDateKey(from), to: toLocalDateKey(to) };
};

const useRangeStats = (rangeKey: MealStatsRangeKey) => {
  const range = MEAL_STATS_RANGES.find((r) => r.value === rangeKey) ?? MEAL_STATS_RANGES[1];
  const { from, to } = useMemo(() => shift(range.days), [range.days]);
  return { range, query: useMealStats(from, to) };
};

// 한눈에(기간 전환 포함) + 주간 인사이트.
export const MealStatsOverview = ({
  rangeKey,
  onChangeRange,
}: {
  rangeKey: MealStatsRangeKey;
  onChangeRange: (key: MealStatsRangeKey) => void;
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const today = toLocalDateKey(new Date());
  const { query } = useRangeStats(rangeKey);
  const { data, isLoading, error, refetch, isFetching } = query;

  return (
    <>
      <MealSection>
        <MealSectionTitle
          title="한눈에"
          sub={
            data
              ? `${mealDateTitle(data.from, today, { weekday: false })} ~ ${mealDateTitle(data.to, today, { weekday: false })}`
              : null
          }
        />
        <SegmentedControl
          value={rangeKey}
          onChange={onChangeRange}
          options={MEAL_STATS_RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
        {isLoading ? (
          <StateBlock kind="loading" />
        ) : error ? (
          <StateBlock
            kind="error"
            message="통계를 불러오지 못했습니다."
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        ) : !data ? (
          <StateBlock kind="empty" />
        ) : (
          <>
            <View style={styles.tiles}>
              <StatTile
                icon="silverware-fork-knife"
                label="기록"
                value={`${data.entryCount}끼`}
                sub={`${data.recordedDays}/${data.totalDays}일`}
              />
              <StatTile icon="fire" label="연속" value={`${data.streakDays}일`} sub="기록한 날" />
              <StatTile
                icon="repeat"
                label="겹침"
                value={`${Math.round(data.repeatRate * 100)}%`}
                sub="7일 내 재등장"
              />
              {data.nutrition.avgKcalPerDay !== null ? (
                <StatTile
                  icon="fire-circle"
                  label="하루 평균"
                  value={`${Math.round(data.nutrition.avgKcalPerDay).toLocaleString('ko-KR')}kcal`}
                  sub={`주식 ${Math.round(data.nutrition.mainItemCoverage * 100)}% · 직접 ${Math.round(data.nutrition.directCoverage * 100)}%`}
                />
              ) : null}
            </View>
            {!data.nutrition.averageReliable && data.entryCount > 0 ? (
              <Text style={styles.coverageNote}>
                주식 영양 근거가 {Math.round(data.nutrition.mainItemCoverage * 100)}%뿐이라 하루 평균은 숨겼어요.
              </Text>
            ) : null}
            {data.nutrition.avgKcalPerDay !== null && data.nutrition.coverage < 1 ? (
              <Text style={styles.coverageNote}>
                직접값 {data.nutrition.itemsDirect}개, 추정값(유사 음식·통상 1인분) {data.nutrition.itemsEstimated}개만
                반영한 값이라 실제와 다를 수 있어요.
              </Text>
            ) : null}
          </>
        )}
      </MealSection>

      {data && data.insights.length > 0 ? (
        <MealSection>
          <MealSectionTitle title="주간 인사이트" sub="최근 7일과 직전 7일을 비교한 기록 기반 관찰이에요" />
          <View style={styles.insightList}>
            {data.insights.map((insight) => (
              <View
                key={insight.key}
                style={[
                  styles.insight,
                  {
                    backgroundColor:
                      insight.tone === 'positive'
                        ? 'rgba(34,197,94,0.10)'
                        : insight.tone === 'attention'
                          ? 'rgba(245,158,11,0.12)'
                          : theme.colors.surfaceAlt,
                  },
                ]}
              >
                <Text style={[styles.insightTitle, { color: theme.colors.text }]}>{insight.title}</Text>
                <Text style={[styles.insightDetail, { color: theme.colors.textMuted }]}>{insight.detail}</Text>
              </View>
            ))}
          </View>
        </MealSection>
      ) : null}
    </>
  );
};

// 분포·자주 먹은 음식·날짜별 끼니 수·추천 반응. 기간은 위 '한눈에'와 같다.
export const MealStatsDetails = ({ rangeKey }: { rangeKey: MealStatsRangeKey }) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const today = toLocalDateKey(new Date());
  const { range, query } = useRangeStats(rangeKey);
  const { data } = query;
  // 로딩·오류는 '한눈에'가 보여 준다 — 여기서 또 그리지 않는다.
  if (!data) return null;

  const periodSub = `최근 ${range.label}`;
  const maxDish = Math.max(1, ...data.byDishType.map((b) => b.count));
  const maxIngredient = Math.max(1, ...data.byMainIngredient.map((b) => b.count));
  const maxCuisine = Math.max(1, ...data.byCuisine.map((b) => b.count));
  const maxDay = Math.max(1, ...data.byDate.map((d) => d.count));

  return (
    <>
      {data.entryCount === 0 ? (
        <MealSection>
          <StateBlock kind="empty" message="이 기간에는 기록이 없어요." />
        </MealSection>
      ) : (
        <>
          <MealSection>
            <MealSectionTitle title="무엇을 먹었나" sub={`조리 형태 · 주식 기준 · ${periodSub}`} />
            {data.byDishType.slice(0, 8).map((b) => (
              <BarRow key={b.key} label={b.label} value={b.count} max={maxDish} />
            ))}
          </MealSection>

          <MealSection>
            <MealSectionTitle title="주재료" sub={periodSub} />
            {data.byMainIngredient.slice(0, 8).map((b) => (
              <BarRow key={b.key} label={b.label} value={b.count} max={maxIngredient} />
            ))}
          </MealSection>

          <MealSection>
            <MealSectionTitle title="요리 계통" sub={periodSub} />
            {data.byCuisine.slice(0, 6).map((b) => (
              <BarRow key={b.key} label={b.label} value={b.count} max={maxCuisine} />
            ))}
          </MealSection>

          <MealSection>
            <MealSectionTitle title="자주 먹은 음식" sub={`같은 이름끼리 묶었어요 · ${periodSub}`} />
            {data.topFoods.length === 0 ? (
              <Text style={styles.muted}>아직 반복된 음식이 없어요.</Text>
            ) : (
              data.topFoods.map((f) => (
                <View key={f.name} style={styles.topRow}>
                  <Text style={styles.topName} numberOfLines={1}>
                    {f.name}
                  </Text>
                  <Text style={styles.topMeta}>
                    {f.count}회 · 마지막 {mealDateLabel(f.lastEatenDate, today)}
                  </Text>
                </View>
              ))
            )}
          </MealSection>

          <MealSection>
            <MealSectionTitle title="날짜별 끼니 수" sub={periodSub} />
            <View style={styles.dayBars}>
              {data.byDate.map((d) => (
                <View key={d.date} style={styles.dayBarCol}>
                  <View
                    style={[
                      styles.dayBar,
                      {
                        height: Math.max(2, (d.count / maxDay) * 48),
                        backgroundColor: d.count > 0 ? theme.colors.primary : theme.colors.surfaceAlt,
                      },
                    ]}
                  />
                </View>
              ))}
            </View>
            <View style={styles.dayAxis}>
              <Text style={styles.muted}>
                {data.byDate[0] ? mealDateTitle(data.byDate[0].date, today, { weekday: false }) : ''}
              </Text>
              <Text style={styles.muted}>
                {data.byDate.length > 0
                  ? mealDateTitle(data.byDate[data.byDate.length - 1]!.date, today, { weekday: false })
                  : ''}
              </Text>
            </View>
          </MealSection>
        </>
      )}

      <MealSection>
        <MealSectionTitle title="추천 반응" sub={`선택한 추천이 실제 기록으로 이어졌는지 · ${periodSub}`} />
        <View style={styles.tiles}>
          <StatTile
            icon="cursor-pointer"
            label="선택"
            value={`${data.recommendation.chosenCount}건`}
            sub={`노출 ${data.recommendation.shownCount}건 · ${Math.round(data.recommendation.pickRate * 100)}%`}
          />
          <StatTile icon="check-circle" label="기록 완료" value={`${data.recommendation.loggedCount}건`} />
          <StatTile
            icon="thumb-up"
            label="평가"
            value={`${data.recommendation.ratedCount}건`}
            sub={`후보별 ${data.recommendation.candidateRatedCount}건`}
          />
          <StatTile
            icon="chart-line"
            label="추천 수락률"
            value={`${Math.round(data.recommendation.acceptanceRate * 100)}%`}
            sub="선택 대비 기록"
          />
        </View>
      </MealSection>
    </>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    tiles: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    coverageNote: { fontSize: mealFont.caption, color: theme.colors.textMuted, lineHeight: 17 },
    insightList: { gap: 8 },
    insight: { borderRadius: mealRadius.control, paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
    insightTitle: { fontSize: mealFont.callout, fontWeight: '700' },
    insightDetail: { fontSize: mealFont.footnote, lineHeight: 18 },
    muted: { fontSize: mealFont.caption, color: theme.colors.textMuted },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
    topName: { flex: 1, fontSize: mealFont.body, color: theme.colors.text },
    topMeta: { fontSize: mealFont.caption, color: theme.colors.textMuted },
    dayBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 52 },
    dayBarCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
    dayBar: { width: '100%', borderRadius: 2 },
    dayAxis: { flexDirection: 'row', justifyContent: 'space-between' },
  });
