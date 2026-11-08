import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { MealNutritionAnalysisType } from '@repo/api-contract';
import {
  MEAL_NUTRIENT_REFERENCE_LABEL,
  MEAL_NUTRIENT_STATUS_LABEL,
  formatNutrientAmount,
  mealNutrientDisplayStatus,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { MEAL_BAR_METRICS, type MealBarMetric } from './mealBarMetrics';
import { MEAL_NUTRIENT_TONE } from './mealNutrientTone';
import { MEAL_PATH } from './mealPaths';

// 분포 막대 위 한 줄(2026-11-08) — 열량·나트륨 막대는 '먹은 것이 어디서 왔나'(묶음 몫, 다 더하면 100%)라 막대만 봐서는 많은지
// 적은지 모른다(영양 탭은 나트륨 많음인데 통계에선 안 보인다는 물음). 그래서 최근 14일 영양소 점검의 하루 평균과 판정을 막대 위에
// 붙여 두 화면을 잇는다. 끼니 수 기준은 예전 안내 그대로.

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
  analysis,
  loading,
  rangeLabel,
}: {
  metric: MealBarMetric;
  /** 최근 14일 영양소 점검 — 오기 전이면 undefined. */
  analysis: MealNutritionAnalysisType | undefined;
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
  let judgment: ReactNode = null;
  if (analysis?.status === 'ok') {
    if (metric === 'kcal' && analysis.energy.intakePerDay !== null) {
      judgment = (
        <>
          열량 하루 평균 <b>{fmt(analysis.energy.intakePerDay)}kcal</b> — 필요량{' '}
          {fmt(analysis.energy.requirement)}kcal의 {analysis.energy.percent}%
        </>
      );
    } else if (metric === 'sodium') {
      const n = analysis.nutrients.find((x) => x.key === 'sodium');
      if (n && n.intakePerDay !== null) {
        const d = mealNutrientDisplayStatus(n);
        judgment = (
          <>
            나트륨 하루 평균 <b>{formatNutrientAmount(n.intakePerDay)}mg</b> —{' '}
            {MEAL_NUTRIENT_REFERENCE_LABEL[n.reference.kind]}{' '}
            {formatNutrientAmount(n.reference.amount)}mg
            {n.percent !== null ? `의 ${n.percent}%` : ''}
            <span className={cn('meal-flag', MEAL_NUTRIENT_TONE[d])}>
              {MEAL_NUTRIENT_STATUS_LABEL[d]}
            </span>
          </>
        );
      }
    }
  }

  return (
    <div className={cn(BOX, 'space-y-1')}>
      <p className="meal-bar-summary">
        {judgment ??
          (loading
            ? '최근 14일 영양 점검을 불러오는 중…'
            : analysis
              ? '최근 14일 기록이 모자라 하루 평균은 판단하지 못했어요.'
              : '최근 14일 영양 점검을 불러오지 못했어요.')}
        {judgment ? (
          <Link to={MEAL_PATH.nutrition} className="meal-bar-summary-link">
            영양 자세히
          </Link>
        ) : null}
      </p>
      <p className="text-sm text-muted-foreground">
        {judgment ? '최근 14일 영양 점검 기준이고, ' : ''}막대는 고른 기간({rangeLabel}) 먹은 {what}
        이 어디서 왔는지예요(다 더하면 100%). <How />
      </p>
    </div>
  );
};
