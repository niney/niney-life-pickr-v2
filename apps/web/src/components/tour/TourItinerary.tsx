import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import type { TourPlanDayType, TourPlanItineraryType, TourPlanStopType } from '@repo/api-contract';
import { cn } from '~/lib/utils';
import { KindDot, SeqChips } from './charts';
import { clockLabel, durationLabel, naverMapSearchUrl, won } from './tourFormat';

// 코스 일정표(10차) — 서버가 집계값으로 합성한 일차별 일정. 왼쪽 시각, 오른쪽 장소·근거·대안, 장소 사이에 이동(추정)과
// 여유 시간. 장소 좌표는 응답에 없어 지도는 이름 검색 링크로 잇고, 등록된 맛집(placeId)은 상세로 간다.

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

const StopRow = ({ stop, prev }: { stop: TourPlanStopType; prev: TourPlanStopType | null }) => {
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
            <TourMapLink name={stop.name} sigungu={stop.sigungu} />
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

const DayCard = ({ day }: { day: TourPlanDayType }) => (
  <article className="rounded-md border p-3" aria-label={`${day.day}일차`}>
    <header className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="flex-none rounded bg-teal-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">{day.day}일차</span>
        <h3 className="min-w-0 truncate text-sm font-semibold">{day.area || '추천 동네'}</h3>
      </div>
      <SeqChips seq={day.pattern} />
      <p className="text-[11px] text-muted-foreground">
        이동 {durationLabel(day.moveMin)} · 직선 {day.moveKm}km · 머묾 {durationLabel(day.stayMin)}
        {day.spendPp !== null && ` · 1인 약 ${won(day.spendPp)}`}
      </p>
    </header>
    <ol className="mt-3">
      {day.stops.map((s, i) => (
        <StopRow key={`${s.name}-${s.arriveMin}`} stop={s} prev={i > 0 ? day.stops[i - 1]! : null} />
      ))}
    </ol>
    <p className="mt-3 border-t pt-2 text-[10px] text-muted-foreground">{BASIS_LABEL[day.patternBasis]}</p>
  </article>
);

export const TourItinerary = ({ itinerary }: { itinerary: TourPlanItineraryType }) => (
  <div className="space-y-2">
    <div className={cn('grid gap-3', itinerary.days.length > 1 && 'md:grid-cols-2', itinerary.days.length > 2 && 'xl:grid-cols-3')}>
      {itinerary.days.map((d) => (
        <DayCard key={d.day} day={d} />
      ))}
    </div>
    <p className="text-[11px] leading-relaxed text-muted-foreground">
      여러 여행에서 흔한 하루 흐름에 만족도 높은 장소를 끼워 넣은 예시이며, 누군가의 실제 일정이 아닙니다. 이동 시간은{' '}
      {itinerary.legBasis === 'observed' ? '여행자들의 구간 기록을 거리별로 집계한' : '직선거리에 기본 속도를 적용한'} 추정이고, 숙소와 배를 타야 하는 섬은 넣지 않았습니다. 2023년 표본이라
      영업 여부는 가기 전에 확인하세요.
    </p>
  </div>
);
