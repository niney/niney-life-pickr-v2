import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, Pill, RefreshCw } from 'lucide-react';
import type {
  MealNutrientResultType,
  MealNutritionAdviceType,
  MealNutritionAnalysisType,
  MealSkipSlotType,
} from '@repo/api-contract';
import {
  useCreateMealNutritionAdvice,
  useLatestMealNutritionAdvice,
  useMealNutrition,
} from '@repo/shared';
import {
  MEAL_NUTRIENT_DATA_SOURCES,
  MEAL_NUTRIENT_REFERENCE_LABEL,
  MEAL_NUTRIENT_STATUS_ORDER,
  formatNutrientAmount,
  mealNutrientDisplayStatus,
  mealNutrientProfileLabel,
} from '@repo/utils';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';
import { prepareMealEntry } from './mealDraftStart';
import { MealLink } from './MealLink';
import { MealNutrientLine, MealNutrientMeter } from './MealNutrientLine';
import { nutrientVsRefText } from './mealNutrientTone';
import { useMealOpen } from './mealPanel';
import { MEAL_PATH } from './mealPaths';
import { MealSkipReview } from './MealSkip';

// 영양 — 최근 기록의 하루 평균을 한국인 영양소 섭취기준(2020)과 견주고(서버 계산), 모자란 영양소를 음식·영양제
// (성분·형태, 제품명 없음)로 채우는 조언을 받는다. 조언은 LLM 이라 누를 때만 만들고, 같은 날·같은 기록이면 서버가
// 저장본을 준다("다시 받기"만 새로). 차트 라이브러리를 쓰지 않는 리포 관례대로 막대는 div 폭으로 그린다.

const PERIODS = [7, 14, 28] as const;

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
  // 기간을 바꾸는 동안 이전 기간 결과를 흐리게 둔다 — 로딩으로 바꾸면 긴 목록이 접혔다 펴지며 화면이 튄다.
  const analysis = useMealNutrition(days, true, { keepPrevious: true });
  const open = useMealOpen();
  // 빠진 날 정리의 [기록하기] — 그날 그 끼니로 새 기록을 연다(홈의 어제 묻기와 같은 시작).
  const recordMissing = (date: string, slot: MealSkipSlotType) => {
    prepareMealEntry({ slot, date });
    open(MEAL_PATH.new);
  };
  // 홈의 '한 번에 정리'(?skips=open)로 오면 빠진 날 정리를 펼친 채 연다.
  const [params] = useSearchParams();
  const openSkips = params.get('skips') === 'open';

  // 데스크톱은 점검과 조언을 나란히 — 조언(이 탭의 결론)이 점검 목록 아래(1,440px)로 밀리지 않게.
  return (
    <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">영양소 점검</CardTitle>
            <div className="meal-seg meal-seg-sm" role="group" aria-label="점검 기간">
              {PERIODS.map((d) => (
                <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d}>
                  {d}일
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            두 끼 이상 기록한 날의 하루 평균을 한국인 영양소 섭취기준(2020)과 견줘요(한 끼만 먹은 날은 남은 끼니를 모두
            '안 먹음'으로 표시하면 들어가요).
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
            <NutritionAnalysisView
              data={analysis.data}
              dim={analysis.isPlaceholderData}
              onRecord={recordMissing}
              openSkips={openSkips}
            />
          )}
        </CardContent>
      </Card>

      <SupplementAdviceCard days={days} analysisReady={analysis.data?.status === 'ok'} />
    </div>
  );
};

// dim: 기간 전환 중 이전 기간 결과를 보여 주는 동안(재조회가 끝나면 풀린다). onRecord: 빠진 날 정리의 [기록하기].
// openSkips: 빠진 날 정리를 펼친 채 연다(홈 링크).
const NutritionAnalysisView = ({
  data,
  dim,
  onRecord,
  openSkips,
}: {
  data: MealNutritionAnalysisType;
  dim?: boolean;
  onRecord: (date: string, slot: MealSkipSlotType) => void;
  openSkips: boolean;
}) => {
  // 한 끼만 적혀 평균에서 빠진 지난날 — 판단을 미룰 때가 가장 쓸모 있어 이유 바로 아래, 점검이 나올 때는 요약 줄 아래.
  const review = <MealSkipReview from={data.from} to={data.to} onRecord={onRecord} defaultExpanded={openSkips} />;
  if (data.status === 'insufficient') {
    return (
      <div className={cn('space-y-4', dim && 'opacity-60')}>
        <div className="meal-empty">
          <p>{data.insufficientReason ?? '기록이 더 쌓이면 볼 수 있어요.'}</p>
          <MealLink to={MEAL_PATH.new} className="meal-btn-line">
            기록하러 가기
          </MealLink>
        </div>
        {review}
      </div>
    );
  }
  const sorted = [...data.nutrients].sort(
    (a, b) =>
      MEAL_NUTRIENT_STATUS_ORDER[mealNutrientDisplayStatus(a)] - MEAL_NUTRIENT_STATUS_ORDER[mealNutrientDisplayStatus(b)],
  );
  return (
    <div className={cn('space-y-4', dim && 'opacity-60')}>
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
      {review}
      {data.notes.length > 0 ? (
        <div className="meal-note meal-note-block text-xs" data-tone="warn">
          <ul className="space-y-1">
            {data.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          {data.profile.basis === 'default' ? (
            <Link to={MEAL_PATH.settings} className="inline-block font-medium underline underline-offset-2">
              설정에서 성별·출생연도 넣기
            </Link>
          ) : null}
        </div>
      ) : null}
      <ul className="space-y-3">
        {sorted.map((n) => (
          <NutrientRow key={n.key} n={n} />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        식단 데이터에 값이 없어 판단하지 않는 영양소: {data.notMeasured.join(', ')}
      </p>
      <p className="text-xs text-muted-foreground">{MEAL_NUTRIENT_DATA_SOURCES}</p>
    </div>
  );
};

const NutrientRow = ({ n }: { n: MealNutrientResultType }) => {
  const short = n.status === 'low' || n.status === 'borderline';
  const shown = mealNutrientDisplayStatus(n);
  const sides = n.sideSuggestions;
  return (
    <li className="space-y-1">
      {/* 줄 모양(이름·판정 칩·"양 / 기준 (N%)"·막대)은 통계 영양소와 같은 부품. 막대 색은 판정(data-tone). */}
      <MealNutrientLine
        label={n.label}
        status={shown}
        value={nutrientVsRefText(
          n.intakePerDay,
          n.unit,
          MEAL_NUTRIENT_REFERENCE_LABEL[n.reference.kind],
          n.reference.amount,
          n.percent,
        )}
        bar={
          <MealNutrientMeter
            percent={n.percent}
            tone={shown}
            ariaLabel={`${n.label} 기준 대비 ${n.percent ?? '알 수 없음'}%`}
          />
        }
      />
      {n.note ? <p className="text-xs text-muted-foreground">{n.note}</p> : null}
      {short && (n.foodSuggestions.length > 0 || sides.length > 0 || n.typicalFoods.length > 0) ? (
        <p className="text-xs text-muted-foreground">
          {n.foodSuggestions.length > 0 ? <>한 끼로는 {n.foodSuggestions.join('·')} · </> : null}
          {sides.length > 0 ? <>곁들임으로는 {sides.join('·')} · </> : null}
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
  // 조언 방식이 바뀌었거나 지금 점검의 판정이 조언 때와 달라졌다 — 옛 조언을 흐리게 두고 다시 받기를 권한다.
  const stale = !!advice && latest.data?.stale === true;

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
        {stale && !create.isPending ? (
          <p className="meal-note text-xs" data-tone="warn">
            기록이나 점검 방식이 바뀌어 아래 조언이 지금 점검과 다를 수 있어요. 위 단추로 새로 받아 보세요.
          </p>
        ) : null}
        {latest.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 지난 조언을 불러오는 중…
          </div>
        ) : advice ? (
          <div className={cn(stale && 'opacity-60')}>
            <AdviceView advice={advice} />
          </div>
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
            <span key={i.nutrient} className="meal-tag">
              {i.label}
            </span>
          ))}
        </div>
      ) : null}
      <ul className="space-y-3">
        {advice.items.map((item) => (
          <li key={item.nutrient} className="meal-item space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-bold">{item.label}</p>
              {item.shortfallPerDay !== null && item.shortfallPerDay > 0 ? (
                <span className="text-xs text-muted-foreground">
                  하루 약 {amount(item.shortfallPerDay, item.unit)} 모자람
                </span>
              ) : null}
            </div>
            <p className="text-sm">{item.reason}</p>
            <AdviceLine label="음식으로" text={item.foodTip} />
            {item.supplementTip ? <AdviceLine label="영양제로" text={item.supplementTip} /> : null}
            <p className="meal-note text-xs text-muted-foreground" data-tone="info">{item.caution}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{advice.disclaimer}</p>
    </div>
  );
};

const AdviceLine = ({ label, text }: { label: string; text: string }) => (
  <div className="flex gap-2 text-sm">
    <span className="shrink-0 text-xs font-bold">{label}</span>
    <span className="text-muted-foreground">{text}</span>
  </div>
);
