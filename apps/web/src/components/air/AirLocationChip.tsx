import { Link } from 'react-router-dom';
import { useAirLocation, useAirNearbyStations } from '@repo/shared';
import { AIR_SIDO_OPTIONS, airSidoMatches, formatAirValue, formatDistanceM } from '@repo/utils';
import { cn } from '~/lib/utils';
import { airGradeStyle, AIR_GRADE_NONE } from './airGrade';

// 상단바 '내 위치 공기질' 칩 — 저장한 내 대기 위치(좌표)로 가장 가까운 측정소의 현재
// 통합지수 등급·PM2.5 를 한 줄로. 저장 위치가 없으면 아무것도 그리지 않는다(강요 없음).
// 클릭 = /air 의 그 측정소로. 데스크톱: 점+측정소명+등급+PM2.5, 모바일: 점+등급.
// 해석은 서버 /air/stations/nearby?limit=1 (측정소 목록 24h·측정값 10분 캐시라 가볍다).

export const AirLocationChip = ({ className }: { className?: string }) => {
  const { location } = useAirLocation();
  const nearbyQ = useAirNearbyStations(location?.lat ?? null, location?.lng ?? null, {
    limit: 1,
    radius: 50_000,
  });
  if (!location) return null;

  const nearest = nearbyQ.data?.items[0] ?? null;
  const measure = nearest?.measure ?? null;
  const grade = measure?.khaiGrade ?? null;
  const style = grade ? airGradeStyle(grade) : AIR_GRADE_NONE;
  const loading = nearbyQ.isLoading && !nearbyQ.data;
  const failed = nearbyQ.isError && !nearbyQ.data;
  const noStation = !loading && !failed && !nearest;

  const sidoOption = nearest
    ? (AIR_SIDO_OPTIONS.find(
        (o) => o.value !== '전국' && nearest.sidoName !== null && airSidoMatches(o.value, nearest.sidoName),
      )?.value ?? null)
    : null;
  const to = nearest
    ? `/air?${new URLSearchParams({ ...(sidoOption ? { sido: sidoOption } : {}), station: nearest.stationName }).toString()}`
    : '/air';

  const gradeText = loading ? '…' : failed ? '대기' : noStation ? '근처 측정소 없음' : style.label;
  const pm25 = measure ? formatAirValue('pm25', measure.pm25) : '-';
  const title = nearest
    ? `내 위치(${location.label ?? '저장 지점'}) 기준 가장 가까운 측정소 ${nearest.stationName} · ${formatDistanceM(nearest.dist)} · 통합지수 ${style.label} · PM10 ${formatAirValue('pm10', measure?.pm10)} / PM2.5 ${pm25} ㎍/㎥`
    : failed
      ? '내 위치 공기질을 불러오지 못했습니다 — 눌러서 대기정보로 이동'
      : '내 위치 공기질';

  return (
    <Link
      to={to}
      title={title}
      aria-label={title}
      data-testid="air-location-chip"
      className={cn(
        'inline-flex h-8 max-w-[14rem] items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors hover:bg-accent',
        className,
      )}
    >
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', style.dot, loading && 'animate-pulse')} />
      {nearest && <span className="hidden truncate font-medium md:inline">{nearest.stationName}</span>}
      <span className="shrink-0">{gradeText}</span>
      {measure && (
        <span className="hidden shrink-0 text-muted-foreground tabular-nums md:inline">PM2.5 {pm25}</span>
      )}
    </Link>
  );
};
