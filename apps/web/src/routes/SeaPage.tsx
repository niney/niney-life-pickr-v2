import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Crosshair, ExternalLink, Loader2 } from 'lucide-react';
import { useSeaForecast, useUserLocation } from '@repo/shared';
import {
  SEA_ACTIVITIES,
  SEA_ACTIVITY_HINT,
  SEA_ACTIVITY_LABEL,
  SEA_INDEX_LABEL,
  formatYmdWithWeekday,
  isSeaActivity,
  relativeDayLabel,
  seaActivityHasPeriod,
  seaIndexColor,
  todayKst,
  type SeaActivity,
  type SeaIndexLevel,
} from '@repo/utils';
import { Button } from '~/components/ui/button';
import { SeaMap } from '~/components/sea/SeaMap';
import { SeaSpotDetail } from '~/components/sea/SeaSpotDetail';
import { formatSeaDistance, rankSeaSpots, seaSlotSummary, type SeaPeriod } from '~/components/sea/seaFormat';
import { cn } from '~/lib/utils';

// 바다 — 국립해양조사원 생활해양예보지수로 "이번 주 바다 어디 갈까" 를 고른다. 활동 탭(해수욕·서핑·바다낚시·
// 갯벌체험·바닷길·바다여행) × 날짜(7일) × 오전/오후를 고르면 지도 마커색과 순위 목록이 그 슬롯의 지수로 바뀌고,
// 지점을 누르면 7일 지수 띠·세부(어종·등급)·이안류·물때를 본다. 상태는 URL(?a&d&p&sel) — 공유·뒤로가기.

const LEVELS_DESC: SeaIndexLevel[] = [5, 4, 3, 2, 1];

// KST 지금 오후인지(기본 시간대 선택).
const isAfternoonKst = (now: Date = new Date()): boolean => (now.getUTCHours() + 9) % 24 >= 12;

export const SeaPage = () => {
  const [params, setParams] = useSearchParams();
  const rawActivity = params.get('a');
  const activity: SeaActivity = isSeaActivity(rawActivity) ? rawActivity : 'beach';
  const forecastQ = useSeaForecast(activity);
  const userLoc = useUserLocation({ auto: false });
  const today = todayKst();

  const dates = forecastQ.data?.dates ?? [];
  const rawDate = params.get('d');
  const date = rawDate && dates.includes(rawDate) ? rawDate : dates.includes(today) ? today : (dates[0] ?? today);
  const rawPeriod = params.get('p');
  const period: SeaPeriod = rawPeriod === 'am' || rawPeriod === 'pm' ? rawPeriod : isAfternoonKst() ? 'pm' : 'am';
  const hasPeriod = seaActivityHasPeriod(activity);
  const sel = params.get('sel');

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const me = userLoc.coords;
  const ranked = useMemo(
    () => rankSeaSpots(forecastQ.data?.spots ?? [], activity, date, period, me),
    [forecastQ.data, activity, date, period, me],
  );
  const selected = ranked.find((r) => r.spot.id === sel) ?? null;
  const fetchedLabel = forecastQ.data
    ? new Date(forecastQ.data.fetchedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">바다</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              국립해양조사원 생활해양예보지수로 이번 주 어느 바다가 좋은지 골라 보세요 — 7일 오전·오후 5단계 지수와 물때.
            </p>
          </div>
          {/* 활동 탭 */}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="바다 활동">
            {SEA_ACTIVITIES.map((a) => (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={a === activity}
                onClick={() => update({ a, sel: null })}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                  a === activity ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {SEA_ACTIVITY_LABEL[a]}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{SEA_ACTIVITY_HINT[activity]}</p>
          {/* 날짜·시간대 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1" role="group" aria-label="날짜">
              {dates.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={d === date}
                  title={formatYmdWithWeekday(d)}
                  onClick={() => update({ d })}
                  className={cn(
                    'rounded-md border px-2 py-1 text-xs tabular-nums transition-colors',
                    d === date ? 'border-foreground font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {relativeDayLabel(d, today)}
                </button>
              ))}
            </div>
            {hasPeriod && (
              <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="시간대">
                {(['am', 'pm'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={p === period}
                    onClick={() => update({ p })}
                    className={cn(
                      'rounded px-2.5 py-0.5 text-xs font-medium',
                      p === period ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {p === 'am' ? '오전' : '오후'}
                  </button>
                ))}
              </div>
            )}
            <Button type="button" variant="outline" size="sm" onClick={userLoc.refetch} disabled={userLoc.status === 'pending'}>
              {userLoc.status === 'pending' ? <Loader2 className="animate-spin" /> : <Crosshair />}
              {me ? '내 위치 갱신' : '내 위치로 거리 보기'}
            </Button>
            {fetchedLabel && (
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                갱신 {fetchedLabel}
                {forecastQ.data?.stale && <span className="ml-1 text-amber-600 dark:text-amber-400">(저장본)</span>}
              </span>
            )}
          </div>
        </header>

        {forecastQ.isError ? (
          <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            바다 예보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <SeaMap
              ranked={ranked}
              selectedId={selected?.spot.id ?? null}
              onSelect={(id) => update({ sel: id })}
              myLocation={me}
              className="h-[360px] lg:h-[600px]"
            />
            <aside className="flex min-h-0 flex-col gap-3 lg:h-[600px] lg:overflow-y-auto" aria-label="지점">
              {forecastQ.isLoading ? (
                <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> 예보를 불러오는 중…
                </p>
              ) : selected ? (
                <SeaSpotDetail
                  key={selected.spot.id}
                  spot={selected.spot}
                  activity={activity}
                  dates={dates}
                  date={date}
                  period={period}
                  today={today}
                  distM={selected.distM}
                  onPick={(d, p) => update({ d, p })}
                  onBack={() => update({ sel: null })}
                />
              ) : (
                <ol className="flex flex-col divide-y rounded-md border" data-testid="sea-list">
                  {ranked.map((r, i) => (
                    <li key={r.spot.id}>
                      <button
                        type="button"
                        onClick={() => update({ sel: r.spot.id })}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent"
                      >
                        <span className="w-5 shrink-0 pt-0.5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                        <span aria-hidden className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: seaIndexColor(r.slot?.level) }} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-1.5">
                            <span className="truncate text-sm font-medium">{r.spot.name}</span>
                            <span className="shrink-0 text-xs font-semibold" style={{ color: seaIndexColor(r.slot?.level) }}>
                              {r.slot?.label ?? '예보 없음'}
                            </span>
                            {r.distM !== null && <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{formatSeaDistance(r.distM)}</span>}
                          </span>
                          {r.slot && <span className="block truncate text-xs text-muted-foreground">{seaSlotSummary(activity, r.slot)}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                  {ranked.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">예보 지점이 없습니다.</li>}
                </ol>
              )}
            </aside>
          </div>
        )}

        {/* 범례 + 출처 */}
        <footer className="flex flex-col gap-1 text-[11px] leading-relaxed text-muted-foreground" data-testid="sea-footer">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {LEVELS_DESC.map((l) => (
              <span key={l} className="inline-flex items-center gap-1">
                <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: seaIndexColor(l) }} />
                {SEA_INDEX_LABEL[l]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: seaIndexColor(0) }} />
              체험불가·예보 없음
            </span>
            <span>바다낚시·서핑은 어종·등급 중 가장 좋은 지수로 색칠</span>
          </div>
          <div>
            출처{' '}
            <a
              href="https://www.khoa.go.kr"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
            >
              국립해양조사원 <ExternalLink className="size-3" />
            </a>{' '}
            생활해양예보지수·조석예보·이안류 지수(공공데이터포털, 공공누리 제1유형). 물때는 가장 가까운 조석 예보지점 기준이라
            실제 지점과 수십 분 차이 날 수 있습니다.
          </div>
        </footer>
      </div>
    </div>
  );
};

