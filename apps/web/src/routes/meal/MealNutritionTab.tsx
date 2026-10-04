import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Pill, RefreshCw } from 'lucide-react';
import type {
  MealNutrientResultType,
  MealNutritionAdviceType,
  MealNutritionAnalysisType,
} from '@repo/api-contract';
import {
  useCreateMealNutritionAdvice,
  useLatestMealNutritionAdvice,
  useMealNutrition,
} from '@repo/shared';
import {
  MEAL_NUTRIENT_REFERENCE_LABEL,
  MEAL_NUTRIENT_STATUS_LABEL,
  MEAL_NUTRIENT_STATUS_ORDER,
  NUTRIENT_BAR_MAX_PERCENT,
  formatNutrientAmount,
  mealNutrientProfileLabel,
  nutrientBarWidth,
} from '@repo/utils';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';

// 영양 — 최근 기록의 하루 평균을 한국인 영양소 섭취기준(2020)과 견주고(서버 계산), 모자란 영양소를 음식·영양제
// (성분·형태, 제품명 없음)로 채우는 조언을 받는다. 조언은 LLM 이라 누를 때만 만들고, 같은 날·같은 기록이면 서버가
// 저장본을 준다("다시 받기"만 새로). 차트 라이브러리를 쓰지 않는 리포 관례대로 막대는 div 폭으로 그린다.

const PERIODS = [7, 14, 28] as const;

const STATUS_TONE: Record<MealNutrientResultType['status'], string> = {
  low: 'bg-red-500/10 text-red-700 dark:text-red-400',
  borderline: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  ok: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  high: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  unknown: 'bg-muted text-muted-foreground',
};
const BAR_TONE: Record<MealNutrientResultType['status'], string> = {
  low: 'bg-red-500',
  borderline: 'bg-amber-500',
  ok: 'bg-emerald-500',
  high: 'bg-orange-500',
  unknown: 'bg-muted-foreground/40',
};

const amount = (v: number, unit: string) => `${formatNutrientAmount(v)}${unit}`;

// done+model 은 AI 문장, done 에 모델이 없으면 조언할 영양소가 없어 계산만으로 끝난 것.
const adviceSourceLabel = (advice: MealNutritionAdviceType): string =>
  advice.status === 'insufficient'
    ? '기록 부족'
    : advice.status === 'fallback'
      ? 'AI 없이 계산으로 쓴 조언'
      : advice.model
        ? 'AI 조언'
        : '계산 결과';

export const MealNutritionTab = () => {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(14);
  const analysis = useMealNutrition(days);

  // 데스크톱은 점검과 조언을 나란히 — 조언(이 탭의 결론)이 점검 목록 아래(1,440px)로 밀리지 않게.
  return (
    <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">영양소 점검</CardTitle>
            <div className="flex gap-1 rounded-md bg-muted p-0.5" role="group" aria-label="점검 기간">
              {PERIODS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  aria-pressed={days === d}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                    days === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {d}일
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            두 끼 이상 기록한 날의 하루 평균을 한국인 영양소 섭취기준(2020)과 견줘요.
          </p>
        </CardHeader>
        <CardContent>
          {analysis.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 기록을 살펴보는 중…
            </div>
          ) : analysis.isError || !analysis.data ? (
            <div className="space-y-3 text-sm">
              <p className="text-destructive">영양소 점검을 불러오지 못했어요.</p>
              <Button variant="outline" size="sm" onClick={() => void analysis.refetch()}>
                다시 시도
              </Button>
            </div>
          ) : (
            <NutritionAnalysisView data={analysis.data} />
          )}
        </CardContent>
      </Card>

      <SupplementAdviceCard days={days} analysisReady={analysis.data?.status === 'ok'} />
    </div>
  );
};

const NutritionAnalysisView = ({ data }: { data: MealNutritionAnalysisType }) => {
  if (data.status === 'insufficient') {
    return (
      <div className="space-y-3 rounded-lg border border-dashed p-5 text-sm">
        <p>{data.insufficientReason ?? '기록이 더 쌓이면 볼 수 있어요.'}</p>
        <Button asChild size="sm" variant="outline">
          <Link to="/me/meals/new">기록하러 가기</Link>
        </Button>
      </div>
    );
  }
  const sorted = [...data.nutrients].sort(
    (a, b) => MEAL_NUTRIENT_STATUS_ORDER[a.status] - MEAL_NUTRIENT_STATUS_ORDER[b.status],
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span>
          최근 {data.days}일 중 <b>{data.analyzedDays}일</b> · 끼니 {data.mealCount}개
        </span>
        {data.energy.intakePerDay !== null ? (
          <span className="text-muted-foreground">
            하루 평균 {formatNutrientAmount(data.energy.intakePerDay)}kcal (필요량{' '}
            {formatNutrientAmount(data.energy.requirement)}kcal의 {data.energy.percent}%)
          </span>
        ) : null}
        <span className="text-muted-foreground">{mealNutrientProfileLabel(data.profile)}</span>
      </div>
      {data.notes.length > 0 ? (
        <ul className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          {data.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      <ul className="space-y-3">
        {sorted.map((n) => (
          <NutrientRow key={n.key} n={n} />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        식단 데이터에 값이 없어 판단하지 않는 영양소: {data.notMeasured.join(', ')}
      </p>
    </div>
  );
};

const NutrientRow = ({ n }: { n: MealNutrientResultType }) => {
  const short = n.status === 'low' || n.status === 'borderline';
  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{n.label}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-xs', STATUS_TONE[n.status])}>
          {MEAL_NUTRIENT_STATUS_LABEL[n.status]}
        </span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {n.intakePerDay !== null ? amount(n.intakePerDay, n.unit) : '-'} /{' '}
          {MEAL_NUTRIENT_REFERENCE_LABEL[n.reference.kind]} {amount(n.reference.amount, n.unit)}
          {n.percent !== null ? ` (${n.percent}%)` : ''}
        </span>
      </div>
      <div
        className="relative h-2 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${n.label} 기준 대비 ${n.percent ?? '알 수 없음'}%`}
      >
        <div className={cn('h-full rounded-full', BAR_TONE[n.status])} style={{ width: `${nutrientBarWidth(n.percent)}%` }} />
        {/* 기준선(100%) */}
        <div
          className="absolute inset-y-0 w-px bg-foreground/40"
          style={{ left: `${(100 / NUTRIENT_BAR_MAX_PERCENT) * 100}%` }}
        />
      </div>
      {n.note ? <p className="text-xs text-muted-foreground">{n.note}</p> : null}
      {short && (n.foodSuggestions.length > 0 || n.typicalFoods.length > 0) ? (
        <p className="text-xs text-muted-foreground">
          {n.foodSuggestions.length > 0 ? <>한 끼로는 {n.foodSuggestions.join('·')} · </> : null}
          많이 든 음식: {n.typicalFoods.join(', ')}
        </p>
      ) : n.topSources.length > 0 && n.status !== 'unknown' ? (
        <p className="text-xs text-muted-foreground">주로 {n.topSources.join('·')}에서</p>
      ) : null}
    </li>
  );
};

const SupplementAdviceCard = ({ days, analysisReady }: { days: number; analysisReady: boolean }) => {
  const latest = useLatestMealNutritionAdvice();
  const create = useCreateMealNutritionAdvice();
  const advice = latest.data?.advice ?? null;

  const request = (force: boolean) => create.mutate({ days, force });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Pill className="size-4" /> 나에게 맞는 영양제
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          모자란 영양소를 음식으로 먼저 채우는 법과, 영양제를 고른다면 어떤 성분·형태가 좋은지 알려 드려요.
          제품은 추천하지 않아요.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => request(false)} disabled={create.isPending || !analysisReady}>
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Pill className="size-4" />}
            {create.isPending ? '조언을 쓰는 중…' : `최근 ${days}일로 조언 받기`}
          </Button>
          {advice ? (
            <Button variant="outline" onClick={() => request(true)} disabled={create.isPending || !analysisReady}>
              <RefreshCw className="size-4" />
              다시 쓰기
            </Button>
          ) : null}
        </div>
        {!analysisReady ? (
          <p className="text-xs text-muted-foreground">기록이 더 쌓이면 조언을 받을 수 있어요.</p>
        ) : create.isPending ? (
          <p className="text-xs text-muted-foreground">AI가 기록을 읽고 있어요. 20초쯤 걸릴 수 있어요.</p>
        ) : null}
        {create.error ? (
          <p className="text-sm text-destructive">
            {create.error instanceof Error ? create.error.message : '조언을 받지 못했어요.'}
          </p>
        ) : null}
        {latest.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 지난 조언을 불러오는 중…
          </div>
        ) : advice ? (
          <AdviceView advice={advice} />
        ) : null}
      </CardContent>
    </Card>
  );
};

const AdviceView = ({ advice }: { advice: MealNutritionAdviceType }) => {
  const picks = advice.items.filter((i) => i.supplementTip !== null);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {advice.targetDate} · 최근 {advice.analysis.days}일 기록 기준 · {adviceSourceLabel(advice)}
      </p>
      <p className="text-sm leading-relaxed">{advice.summary}</p>
      {picks.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">영양제로 채운다면</span>
          {picks.map((i) => (
            <span key={i.nutrient} className="rounded-full border border-primary/40 bg-primary/5 px-2.5 py-0.5 text-xs font-medium">
              {i.label}
            </span>
          ))}
        </div>
      ) : null}
      <ul className="space-y-3">
        {advice.items.map((item) => (
          <li key={item.nutrient} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">{item.label}</p>
              {item.shortfallPerDay !== null && item.shortfallPerDay > 0 ? (
                <span className="text-xs text-muted-foreground">
                  하루 약 {amount(item.shortfallPerDay, item.unit)} 모자람
                </span>
              ) : null}
            </div>
            <p className="text-sm">{item.reason}</p>
            <AdviceLine label="음식으로" text={item.foodTip} />
            {item.supplementTip ? <AdviceLine label="영양제로" text={item.supplementTip} /> : null}
            <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">{item.caution}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{advice.disclaimer}</p>
    </div>
  );
};

const AdviceLine = ({ label, text }: { label: string; text: string }) => (
  <div className="flex gap-2 text-sm">
    <span className="shrink-0 text-xs font-medium text-primary">{label}</span>
    <span className="text-muted-foreground">{text}</span>
  </div>
);
