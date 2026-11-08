import type { ReactNode } from 'react';
import type { MealStatsNutrientsResultType } from '@repo/api-contract';
import {
  MEAL_NUTRIENT_REFERENCE_LABEL,
  MEAL_NUTRIENT_STATUS_LABEL,
  formatNutrientAmount,
  mealNutrientDisplayStatus,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { MEAL_BAR_METRICS, type MealBarMetric } from './mealBarMetrics';
import { MEAL_NUTRIENT_TONE } from './mealNutrientTone';

// 분포 막대 위 한 줄(2026-11-08) — 열량·나트륨 막대는 '먹은 것이 어디서 왔나'(묶음 몫, 다 더하면 100%)라 막대만 봐서는 많은지
// 적은지 모른다(영양 탭은 나트륨 많음인데 통계에선 안 보인다는 물음). 그래서 막대 위에 하루 평균과 판정을 붙인다 — 같은 날
// 통계의 영양 표처럼 고른 기간을 영양 탭과 같은 셈(두 끼 이상 기록한 날, 같은 섭취기준·판정)으로 본 값이다. 끼니 수 기준은
// 예전 안내 그대로.

// 카드를 여는 법 — 마우스는 막대에 올리거나 누르고, 휴대폰·태블릿처럼 손가락이 주 입력이면(`pointer: coarse`) 누르기만
// 된다. 화면 폭이 아니라 입력 방식으로 가르고(넓은 태블릿도 손가락), CSS 미디어라 그 기기에 맞는 문구 하나만 보이고 읽힌다.
const How = () => (
  <>
    <span className="pointer-coarse:hidden">막대에 올리거나 누르면</span>
    <span className="hidden pointer-coarse:inline">막대를 누르면</span> 그 묶음이 채운 영양이 보여요.
  </>
);

const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');

// 토글과 한 줄에 서되 20rem 아래로는 줄지 않는다 — 휴대폰 폭에선 토글이 다음 줄로 내려가 문장이 온 폭을 쓴다
// (flex-1 은 바탕 폭이 0 이라 줄을 안 바꾸고 토글 옆에서 한 칸 폭까지 좁아졌다).
const BOX = 'min-w-0 grow basis-80';

export const MealBarSummary = ({
  metric,
  data,
  loading,
  rangeLabel,
}: {
  metric: MealBarMetric;
  /** 통계의 영양소별 하루 평균(고른 기간) — 오기 전이면 undefined. */
  data: MealStatsNutrientsResultType | undefined;
  loading: boolean;
  /** 막대의 기간(통계에서 고른 1주·1달·3달). */
  rangeLabel: string;
}) => {
  if (metric === 'count') {
    const hint = MEAL_BAR_METRICS.find((m) => m.key === 'count')?.hint ?? '';
    return (
      <p className={cn(BOX, 'text-sm text-muted-foreground')}>
        막대: {hint}. <How />
      </p>
    );
  }

  const what = metric === 'kcal' ? '열량' : '나트륨';
  const row = data?.rows.find((r) => r.key === metric);
  let judgment: ReactNode = null;
  if (data && row && row.intakePerDay !== null && row.reference && data.analyzedDays > 0) {
    if (metric === 'kcal') {
      judgment = (
        <>
          열량 하루 평균 <b>{fmt(row.intakePerDay)}kcal</b> — 필요량 {fmt(row.reference.amount)}kcal의{' '}
          {row.percent}%
        </>
      );
    } else {
      // 많음만 붙인다 — 나트륨의 '충분'(기준 아래)은 어색하고, 기록이 모자라 판단 보류면 표시 없이 양만.
      const d = row.status ? mealNutrientDisplayStatus({ status: row.status, recordGap: row.recordGap }) : null;
      judgment = (
        <>
          나트륨 하루 평균 <b>{formatNutrientAmount(row.intakePerDay)}mg</b> —{' '}
          {row.reference.kind === 'eer' ? '필요량' : MEAL_NUTRIENT_REFERENCE_LABEL[row.reference.kind]}{' '}
          {formatNutrientAmount(row.reference.amount)}mg
          {row.percent !== null ? `의 ${row.percent}%` : ''}
          {d === 'high' ? (
            <span className={cn('meal-flag', MEAL_NUTRIENT_TONE[d])}>{MEAL_NUTRIENT_STATUS_LABEL[d]}</span>
          ) : null}
        </>
      );
    }
  }

  return (
    <div className={cn(BOX, 'space-y-1')}>
      <p className="meal-bar-summary">
        {judgment ??
          (loading
            ? '하루 평균을 불러오는 중…'
            : data
              ? '두 끼 이상 기록한 날이 없어 하루 평균은 내지 못했어요.'
              : '하루 평균을 불러오지 못했어요.')}
      </p>
      <p className="text-sm text-muted-foreground">
        {judgment && data ? `두 끼 이상 기록한 ${data.analyzedDays}일 평균이고, ` : ''}막대는 고른
        기간({rangeLabel}) 먹은 {what}이 어디서 왔는지예요(다 더하면 100%). <How />
      </p>
    </div>
  );
};
