import { Loader2, ShieldAlert } from 'lucide-react';
import type { LifeCrimeRegionType, LifeCrimeStatsResultType } from '@repo/api-contract';
import {
  LIFE_CRIME_CATEGORIES,
  LIFE_CRIME_GRADES,
  LIFE_CRIME_GRADE_COLOR,
  LIFE_CRIME_GRADE_LABEL,
  LIFE_CRIME_METRICS,
  LIFE_CRIME_METRIC_LABEL,
  formatLifeCrimeRate,
  lifeCrimeGrade,
  type LifeCrimeMetric,
} from '@repo/utils';
import { cn } from '~/lib/utils';

// 범죄 통계 요약 카드 — 배경 레이어가 켜져 있을 때 주변 목록 머리 아래(데스크톱 패널·모바일 시트 공용)
// 에 하나만 뜬다. 점 레이어의 내주변·상세와 섞지 않는다: 면 데이터라 "지도 중심(또는 클릭한) 시군구"
// 한 곳의 등급·발생률·순위·3종 건수만 보여 준다. 메트릭 칩(전체·강력·절도·폭력)은 지도 색칠과 카드
// 숫자를 함께 바꾼다. 범례는 카드 안(색만으로 뜻을 전하지 않도록 등급 라벨을 붙인다).

interface Props {
  stats: LifeCrimeStatsResultType | undefined;
  loading: boolean;
  error: boolean;
  // 카드가 보여 줄 시군구 — 지도 중심(기본) 또는 클릭으로 고정한 곳. 경계 밖(바다·국외)이면 null.
  region: LifeCrimeRegionType | null;
  // true = 클릭으로 고정된 상태(지도를 움직여도 안 바뀜). 버튼으로 지도 중심 추적으로 되돌린다.
  pinned: boolean;
  onUnpin: () => void;
  metric: LifeCrimeMetric;
  onMetric: (metric: LifeCrimeMetric) => void;
  className?: string;
}

const chipClass = (active: boolean): string =>
  cn(
    'inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs transition-colors',
    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
  );

const GradeBadge = ({ grade }: { grade: 1 | 2 | 3 | 4 | 5 }) => (
  <span
    className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
    data-testid="life-crime-grade"
  >
    <span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: LIFE_CRIME_GRADE_COLOR[grade] }} />
    {grade}등급 · {LIFE_CRIME_GRADE_LABEL[grade]}
  </span>
);

export const LifeCrimeCard = ({ stats, loading, error, region, pinned, onUnpin, metric, onMetric, className }: Props) => {
  const grade = stats && region ? lifeCrimeGrade(region.per100k[metric], stats.breaks[metric]) : null;
  return (
    <section className={cn('border-b px-3 py-2', className)} data-testid="life-crime-card" aria-label="범죄 통계">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
        <ShieldAlert className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="font-medium">범죄 통계</span>
        {stats && <span className="text-muted-foreground">{stats.year}년 · 인구 10만 명당 · 전국 5등급</span>}
      </div>

      <div
        className="-mr-3 mt-1.5 flex gap-1.5 overflow-x-auto whitespace-nowrap pr-3 [scrollbar-width:none]"
        role="group"
        aria-label="범죄군"
        data-testid="life-crime-metrics"
      >
        {LIFE_CRIME_METRICS.map((m) => (
          <button key={m} type="button" aria-pressed={metric === m} onClick={() => onMetric(m)} className={chipClass(metric === m)}>
            {LIFE_CRIME_METRIC_LABEL[m]}
          </button>
        ))}
      </div>

      {loading && !stats ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> 범죄 통계 불러오는 중…
        </p>
      ) : error || !stats ? (
        <p className="mt-2 text-xs text-muted-foreground">범죄 통계를 불러오지 못했습니다.</p>
      ) : !region || grade === null ? (
        <p className="mt-2 text-xs text-muted-foreground">
          지도 중심이 시군구 경계 밖입니다(바다·국외). 지도를 옮기거나 색칠된 곳을 눌러 보세요.
        </p>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <h3 className="text-sm font-semibold" data-testid="life-crime-region">
              {region.label}
            </h3>
            {pinned ? (
              <button type="button" onClick={onUnpin} className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
                지도 중심 따라가기
              </button>
            ) : (
              <span className="text-[11px] text-muted-foreground">지도 중심</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <GradeBadge grade={grade} />
            <span className="text-lg font-semibold tabular-nums" data-testid="life-crime-rate">
              {formatLifeCrimeRate(region.per100k[metric])}
            </span>
            <span className="text-xs text-muted-foreground">건 / 10만 명</span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              전국 {region.rank[metric]}위 / {stats.regionCount}
            </span>
          </div>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 gap-y-0.5 text-xs tabular-nums">
            {LIFE_CRIME_CATEGORIES.map((c) => {
              const g = lifeCrimeGrade(region.per100k[c], stats.breaks[c]);
              return (
                <div key={c} className="contents">
                  <span aria-hidden className="size-2 rounded-sm" style={{ backgroundColor: LIFE_CRIME_GRADE_COLOR[g] }} />
                  <dt className={cn('text-muted-foreground', metric === c && 'font-medium text-foreground')}>{LIFE_CRIME_METRIC_LABEL[c]}</dt>
                  <dd className="text-right text-muted-foreground">{region.counts[c].toLocaleString('ko-KR')}건</dd>
                  <dd className="text-right">{formatLifeCrimeRate(region.per100k[c])}</dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            인구 {region.population.toLocaleString('ko-KR')}명({stats.populationBase} 주민등록) 기준 · 상업·관광 중심지는 주민 대비 유동인구가 많아 높게 나옵니다.
          </p>
        </>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground" aria-label="등급 범례">
        {LIFE_CRIME_GRADES.map((g) => (
          <span key={g} className="inline-flex items-center gap-1">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: LIFE_CRIME_GRADE_COLOR[g] }} />
            {g} {LIFE_CRIME_GRADE_LABEL[g]}
          </span>
        ))}
      </div>
    </section>
  );
};
