import { Link } from 'react-router-dom';
import { BedDouble, CloudRain, MapPin, Pin, X } from 'lucide-react';
import type { TourPlanDayType, TourPlanItineraryType, TourPlanStopType } from '@repo/api-contract';
import { cn } from '~/lib/utils';
import { KindDot, SeqChips } from './charts';
import { formatYmdWithWeekday } from '@repo/utils';
import { clockLabel, durationLabel, naverMapSearchUrl, won, type TourDayWeather } from './tourFormat';

// 코스 일정표(10차) — 서버가 집계값으로 합성한 일차별 일정. 왼쪽 시각, 오른쪽 장소·근거·대안, 장소 사이에 이동(추정)과
// 여유 시간. 장소 좌표는 응답에 없어 지도는 이름 검색 링크로 잇고, 등록된 맛집(placeId)은 상세로 간다.
// 11차 — 꼭 갈 곳은 핀 표시, 장소마다 "빼기"(onAvoid → 그 장소 없이 다시 짠다), 숙소 동네를 줬으면 숙소에서·숙소까지 이동.
// 12차 — 출발일을 줬으면 일차마다 날짜와 예보(weather), 비 오는 날로 짠 일차(day.wet)는 표시한다.
// 13차 — 제주 밖은 식당마다 표본이 얇아 식사 자리를 볼거리로 채운 날이 있다. 식당이 하나도 없는 날은 그렇게 알린다.

const BASIS_LABEL: Record<TourPlanDayType['patternBasis'], string> = {
  similar: '비슷한 여행에서 흔한 하루 순서',
  region: '이 지역 여행에서 흔한 하루 순서',
  default: '기본 순서(표본 부족)',
};
// 앞 장소를 떠나 이동한 뒤에도 이만큼 남으면 "여유" 로 알린다(숙소·자유 시간).
const FREE_MIN = 60;

export const TourMapLink = ({ name, sigungu, className }: { name: string; sigungu?: string | null; className?: string }) => (
  <a
    href={naverMapSearchUrl(name, sigungu)}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={`${name} 지도에서 찾기`}
    title="지도에서 찾기"
    className={cn('flex-none text-muted-foreground hover:text-foreground', className)}
  >
    <MapPin className="size-3.5" />
  </a>
);

const StayLine = ({ children }: { children: React.ReactNode }) => (
  <p className="flex items-center gap-1.5 py-1 pl-[3.25rem] text-[11px] text-muted-foreground">
    <BedDouble className="size-3.5 flex-none" aria-hidden />
    {children}
  </p>
);

const StopRow = ({ stop, prev, onAvoid, busy }: { stop: TourPlanStopType; prev: TourPlanStopType | null; onAvoid?: (stop: TourPlanStopType) => void; busy?: boolean }) => {
  const free = prev && stop.moveMin !== null ? stop.arriveMin - (prev.arriveMin + prev.stayMin + stop.moveMin) : 0;
  return (
    <li>
      {prev && stop.moveMin !== null && (
        <p className="ml-[1.35rem] border-l border-dashed border-border py-1.5 pl-[2.1rem] text-[11px] text-muted-foreground">
          이동 약 {durationLabel(stop.moveMin)}
          {stop.moveKm !== null && ` · 직선 ${stop.moveKm}km`}
          {free >= FREE_MIN && ` · 여유 약 ${durationLabel(Math.round(free / 30) * 30)}`}
        </p>
      )}
      <div className="flex gap-2">
        <time className="w-11 flex-none pt-px text-xs font-semibold tabular-nums text-teal-700 dark:text-teal-300">{clockLabel(stop.arriveMin)}</time>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <KindDot kind={stop.kind} className="flex-none" />
            {stop.placeId ? (
              <Link to={`/restaurants-v2/${stop.placeId}`} className="truncate underline-offset-2 hover:underline">
                {stop.name}
              </Link>
            ) : (
              <span className="truncate">{stop.name}</span>
            )}
            {stop.pinned && (
              <span className="inline-flex flex-none items-center gap-0.5 rounded bg-teal-600/10 px-1 py-px text-[10px] font-medium text-teal-800 dark:text-teal-300">
                <Pin className="size-3" aria-hidden />꼭
              </span>
            )}
            <TourMapLink name={stop.name} sigungu={stop.sigungu} />
            {onAvoid && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onAvoid(stop)}
                aria-label={`${stop.name} 일정에서 빼기`}
                title="이 장소 없이 다시 짜기"
                className="ml-auto flex-none rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {stop.kind} · 여행 {stop.n}건 · 만족 {stop.mean !== null ? stop.mean.toFixed(1) : '–'} · {durationLabel(stop.stayMin)} 머묾
            {stop.spendPp !== null && ` · 1인 ${won(stop.spendPp)}`}
          </div>
          {stop.alternatives.length > 0 && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              대신 갈 만한 곳:{' '}
              {stop.alternatives.map((a, i) => (
                <span key={a.name}>
                  {i > 0 && ', '}
                  {a.placeId ? (
                    <Link to={`/restaurants-v2/${a.placeId}`} className="text-foreground underline-offset-2 hover:underline">
                      {a.name}
                    </Link>
                  ) : (
                    <span className="text-foreground">{a.name}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
};

const MEAL_KIND = '식당';

const DayCard = ({ day, weather, onAvoid, busy }: { day: TourPlanDayType; weather?: TourDayWeather; onAvoid?: (stop: TourPlanStopType) => void; busy?: boolean }) => (
  // min-w-0 — 격자 칸의 기본 최소 폭은 내용의 최소 폭이라, 긴 장소 이름(말줄임 대상)이 카드를 화면 밖으로 민다.
  <article className="min-w-0 rounded-md border p-3" aria-label={`${day.day}일차`}>
    <header className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="flex-none rounded bg-teal-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">{day.day}일차</span>
        <h3 className="min-w-0 truncate text-sm font-semibold">{day.area || '추천 동네'}</h3>
      </div>
      {(weather || day.wet) && (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
          {weather && <span className="font-medium text-foreground">{formatYmdWithWeekday(weather.date)}</span>}
          {weather?.forecast && <span>· {weather.forecast}</span>}
          {day.wet ? (
            <span className="inline-flex items-center gap-0.5 rounded bg-sky-500/10 px-1 py-px font-medium text-sky-800 dark:text-sky-300">
              <CloudRain className="size-3" aria-hidden />비 예보 · 실내 위주
            </span>
          ) : (
            weather?.wet && <span className="text-sky-800 dark:text-sky-300">· 비 예보 — 다시 찾으면 실내 위주로 짭니다</span>
          )}
        </p>
      )}
      <SeqChips seq={day.pattern} />
      <p className="text-[11px] text-muted-foreground">
        이동 {durationLabel(day.moveMin)} · 직선 {day.moveKm}km · 머묾 {durationLabel(day.stayMin)}
        {day.spendPp !== null && ` · 1인 약 ${won(day.spendPp)}`}
      </p>
    </header>
    <div className="mt-3">
      {day.fromStayMin !== null && <StayLine>숙소에서 약 {durationLabel(day.fromStayMin)}</StayLine>}
      <ol>
        {day.stops.map((s, i) => (
          <StopRow key={`${s.name}-${s.arriveMin}`} stop={s} prev={i > 0 ? day.stops[i - 1]! : null} onAvoid={onAvoid} busy={busy} />
        ))}
      </ol>
      {day.toStayMin !== null && <StayLine>숙소까지 약 {durationLabel(day.toStayMin)}</StayLine>}
    </div>
    {day.stops.every((s) => s.kind !== MEAL_KIND) && (
      <p className="mt-2 text-[11px] text-muted-foreground">이 동네는 추천할 만큼 표본이 쌓인 식당이 없어 식사 자리 없이 짰습니다 — 끼니는 지도에서 근처 식당을 찾아 끼워 넣으세요.</p>
    )}
    <p className="mt-3 border-t pt-2 text-[10px] text-muted-foreground">{BASIS_LABEL[day.patternBasis]}</p>
  </article>
);

interface Props {
  itinerary: TourPlanItineraryType;
  // 일차 순서대로의 날짜·예보(출발일을 줬을 때). 일정이 바란 일수보다 짧으면 날짜가 어긋날 수 있어 호출부가 넘기지 않는다.
  weather?: TourDayWeather[];
  onAvoid?: (stop: TourPlanStopType) => void;
  busy?: boolean;
  // 부속섬(배를 타야 하는 곳)을 일정에서 뺀 지역인가 — 제주만 그렇다(utils TOUR_ITINERARY_REGIONS).
  skipIslands?: boolean;
}

export const TourItinerary = ({ itinerary, weather, onAvoid, busy, skipIslands }: Props) => (
  <div className="space-y-2">
    <div className={cn('grid gap-3 transition-opacity', itinerary.days.length > 1 && 'md:grid-cols-2', itinerary.days.length > 2 && 'xl:grid-cols-3', busy && 'opacity-60')}>
      {itinerary.days.map((d, i) => (
        <DayCard key={d.day} day={d} weather={weather?.[i]} onAvoid={onAvoid} busy={busy} />
      ))}
    </div>
    <p className="text-[11px] leading-relaxed text-muted-foreground">
      여러 여행에서 흔한 하루 흐름에 만족도 높은 장소를 끼워 넣은 예시이며, 누군가의 실제 일정이 아닙니다. 이동 시간은 {itinerary.transport === 'transit' ? '대중교통' : '차'} 기준으로{' '}
      {itinerary.legBasis === 'observed' ? '여행자들의 구간 기록을 거리별로 집계한' : '직선거리에 기본 속도를 적용한'} 추정이고, {skipIslands ? '숙소와 배를 타야 하는 섬은' : '숙소는'} 넣지 않았습니다. 2023년
      표본이라 영업 여부는 가기 전에 확인하세요.
    </p>
  </div>
);
