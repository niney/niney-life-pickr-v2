import { AlertTriangle, Loader2, LocateFixed } from 'lucide-react';
import { Routes, type HikingRecommendResultType } from '@repo/api-contract';
import {
  HIKING_DIFFICULTY_LABEL,
  HIKING_DURATIONS,
  HIKING_DURATION_LABEL,
  HIKING_DURATION_RANGE,
  HIKING_LEVELS,
  HIKING_LEVEL_LABEL,
  HIKING_ORIGIN_CITIES,
  HIKING_TRAVEL_MODES,
  HIKING_TRAVEL_MODE_LABEL,
  formatHikingEle,
  type HikingDuration,
  type HikingLevel,
  type HikingTravelMode,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { hikingDayLabel, hikingStartsFor, minToHm } from './hikingFormat';

// 등산 추천 모드(4차) — 산 목록 자리에 입력 칸(출발 위치·날짜·출발 시각·산행 시간·난이도·이동 수단)과 추천 목록(코스·이유 문장·
// 주의할 점). 사용자 결정(2026-10-25): 목록 위 '추천' 모드, 거리는 직선 + 대략 차로 시간. 입력은 URL(rd·rt·rh·rl·rm·ro)이라
// 산을 골랐다 돌아와도 그대로다. docs/PLAN-hiking.md §4차

export type HikingOrigin = 'me' | (typeof HIKING_ORIGIN_CITIES)[number]['key'];
export type HikingOriginState = 'ok' | 'pending' | 'failed' | 'idle';

export interface HikingRecommendInput {
  day: number;
  startMin: number;
  duration: HikingDuration;
  level: HikingLevel;
  mode: HikingTravelMode;
  origin: HikingOrigin;
}

interface Props {
  input: HikingRecommendInput;
  dates: readonly string[];
  openedAt: number;
  // 출발 위치가 '내 위치'일 때 측위 상태.
  originState: HikingOriginState;
  onChange: (patch: Partial<HikingRecommendInput>) => void;
  onUseMyLocation: () => void;
  result: HikingRecommendResultType | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  selectedMountainId: string | null;
  onSelect: (mountainId: string, courseId: string) => void;
}

const fitsDuration = (outingMin: number | null, d: HikingDuration): boolean =>
  outingMin !== null && outingMin >= HIKING_DURATION_RANGE[d].min && outingMin <= HIKING_DURATION_RANGE[d].max;

const chip = (on: boolean) =>
  cn(
    'shrink-0 rounded-full border px-2.5 py-0.5 text-xs disabled:opacity-40',
    on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground',
  );

export const HikingRecommend = ({
  input,
  dates,
  openedAt,
  originState,
  onChange,
  onUseMyLocation,
  result,
  isLoading,
  isFetching,
  isError,
  selectedMountainId,
  onSelect,
}: Props) => {
  const date = dates[input.day] ?? dates[0]!;
  const starts = hikingStartsFor(date, input.day, openedAt);
  const selectDay = (i: number) => {
    const allowed = hikingStartsFor(dates[i]!, i, openedAt);
    onChange({ day: i, startMin: allowed.includes(input.startMin) ? input.startMin : (allowed[0] ?? input.startMin) });
  };
  const originNote =
    input.origin !== 'me'
      ? null
      : originState === 'pending'
        ? '내 위치를 찾는 중…'
        : originState === 'failed'
          ? '내 위치를 찾지 못해 거리는 빼고 추천합니다 — 출발 도시를 고르세요.'
          : originState === 'idle'
            ? '거리를 보려면 내 위치를 허용하거나 출발 도시를 고르세요.'
            : null;

  return (
    <div className="flex flex-col" data-testid="hiking-recommend">
      <div className="flex flex-col gap-2 border-b px-3 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">출발</span>
            <select
              aria-label="출발 위치"
              value={input.origin}
              onChange={(e) => {
                const v = e.target.value as HikingOrigin;
                onChange({ origin: v });
                if (v === 'me') onUseMyLocation();
              }}
              className="h-7 rounded-md border bg-background px-1.5 text-xs"
            >
              <option value="me">내 위치</option>
              {HIKING_ORIGIN_CITIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {input.origin === 'me' && originState !== 'ok' && originState !== 'pending' && (
            <button type="button" onClick={onUseMyLocation} className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-accent">
              <LocateFixed className="size-3.5" /> 내 위치
            </button>
          )}
          <div role="group" aria-label="이동 수단" className="ml-auto flex gap-1">
            {HIKING_TRAVEL_MODES.map((m) => (
              <button key={m} type="button" aria-pressed={input.mode === m} onClick={() => onChange({ mode: m })} className={chip(input.mode === m)}>
                {HIKING_TRAVEL_MODE_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        {originNote && <p className="text-[11px] text-muted-foreground">{originNote}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          <div role="group" aria-label="추천 날짜" className="flex gap-1">
            {dates.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={i === input.day}
                disabled={hikingStartsFor(d, i, openedAt).length === 0}
                onClick={() => selectDay(i)}
                className={chip(i === input.day)}
              >
                {hikingDayLabel(d, i)}
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">출발</span>
            <select
              aria-label="추천 출발 시각"
              value={input.startMin}
              onChange={(e) => onChange({ startMin: Number(e.target.value) })}
              className="h-7 rounded-md border bg-background px-1.5 text-xs tabular-nums"
            >
              {starts.map((m) => (
                <option key={m} value={m}>
                  {minToHm(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div role="group" aria-label="산행 시간" className="flex gap-1">
            {HIKING_DURATIONS.map((d) => (
              <button key={d} type="button" aria-pressed={input.duration === d} onClick={() => onChange({ duration: d })} className={chip(input.duration === d)}>
                {HIKING_DURATION_LABEL[d]}
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">난이도</span>
            <select
              aria-label="난이도"
              value={input.level}
              onChange={(e) => onChange({ level: e.target.value as HikingLevel })}
              className="h-7 rounded-md border bg-background px-1.5 text-xs"
            >
              {HIKING_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {HIKING_LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 px-3 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 날씨·산불까지 살펴 추천하는 중…
        </p>
      ) : isError ? (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">추천을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>
      ) : result ? (
        <>
        {result.items.length > 0 && !result.items.some((it) => fitsDuration(it.course.outingMin, input.duration)) && (
          <p className="mx-3 mt-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300" data-testid="hiking-recommend-hint">
            {HIKING_DURATION_LABEL[input.duration]} 길이로 {minToHm(input.startMin)}에 출발해 해 지기 전에 내려올 코스가 없어 다른 길이를 골랐습니다 — 출발을
            당기거나 산행 시간을 바꿔 보세요.
          </p>
        )}
        <ol className={cn('flex flex-col divide-y transition-opacity', isFetching && 'opacity-60')} data-testid="hiking-recommend-list">
          {result.items.map((it) => {
            const warns = it.cautions.filter((c) => c.level === 'warn');
            return (
              <li key={it.course.id}>
                <button
                  type="button"
                  onClick={() => onSelect(it.mountain.id, it.course.id)}
                  aria-current={it.mountain.id === selectedMountainId ? 'true' : undefined}
                  className={cn('flex w-full gap-3 px-3 py-2.5 text-left hover:bg-accent', it.mountain.id === selectedMountainId && 'bg-accent')}
                >
                  <span className="relative shrink-0">
                    {it.mountain.images[0] !== undefined ? (
                      <img src={Routes.Hiking.image(it.mountain.id, it.mountain.images[0])} alt="" loading="lazy" className="size-12 rounded bg-muted object-cover" />
                    ) : (
                      <span aria-hidden className="block size-12 rounded bg-muted" />
                    )}
                    <span className="absolute -left-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                      {it.rank}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="truncate text-sm font-medium">{it.mountain.name}</span>
                      {it.mountain.kind === 'top100' && (
                        <span className="shrink-0 rounded bg-emerald-500/10 px-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">100대 명산</span>
                      )}
                      {it.mountain.heightM !== null && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatHikingEle(it.mountain.heightM)}</span>}
                      {it.course.difficulty && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{HIKING_DIFFICULTY_LABEL[it.course.difficulty]}</span>}
                    </span>
                    <span className="block truncate text-xs">{it.course.name}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{it.reason}</span>
                    {warns.length > 0 && (
                      <span className="mt-0.5 flex flex-col gap-0.5">
                        {warns.slice(0, 2).map((c) => (
                          <span key={c.text} className="flex items-start gap-1 text-[11px] text-amber-800 dark:text-amber-300">
                            <AlertTriangle aria-hidden className="mt-0.5 size-3 shrink-0" />
                            {c.text}
                          </span>
                        ))}
                        {warns.length > 2 && <span className="text-[11px] text-muted-foreground">주의 {warns.length - 2}개 더</span>}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
          {result.items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">추천할 코스가 없습니다.</li>}
        </ol>
        </>
      ) : null}
      <p className="px-3 pt-2 text-[11px] leading-relaxed text-muted-foreground">
        100대 명산과 전국 주요 봉우리를 산행 시간·난이도·거리·해 지기 전 하산·주차/정류장·산 소개의 계절 볼거리로 고르고(100대 명산은 조금
        앞세웁니다), 위쪽 산만 날씨·산불·대기를 더 봅니다. 차로 시간은 직선거리 × 1.3 으로 본 대략값(추정)입니다.
      </p>
    </div>
  );
};
