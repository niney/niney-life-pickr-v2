import { Link } from 'react-router-dom';
import { MapPin, Umbrella } from 'lucide-react';
import { useAirLocation, useAirNearbyStations, useWeatherNowcast } from '@repo/shared';
import {
  AIR_SIDO_OPTIONS,
  KMA_CONDITION_LABEL,
  airSidoMatches,
  formatAirValue,
  formatDistanceM,
  formatKmaTemp,
  kmaCondition,
  latLngToKmaGrid,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { AIR_GRADE_NONE, airGradeStyle } from '~/components/air/airGrade';
import { formatBaseLabel } from './weatherFormat';
import { WeatherConditionIcon } from './weatherIcons';

// 상단바 "내 위치" 칩 — 저장한 내 위치(대기정보·날씨 페이지에서 저장, 로그인 서버·게스트 로컬)
// 하나를 알약 하나에: [📍라벨 ☁기온 상태 ☂] · [●등급 PM2.5]. 경계선 없이 두 클릭 영역만 —
// 왼쪽(라벨+날씨) → /weather, 오른쪽(대기) → /air. 위치 이름은 앞에 한 번만(두 반쪽이 따로
// 노는 느낌을 없앤다). 한쪽 자료를 못 받으면 그 세그먼트만 조용히 빠지고 알약은 그대로(칩은
// 경고하는 자리가 아니다). 저장 위치가 없으면 아무것도 그리지 않는다(강요 없음).
// 날씨: 좌표→격자 실황 기온 + 초단기 첫 시각 하늘 + 앞 6시간 강수(형태 또는 확률 ≥60%) 우산.
// 대기: /air/stations/nearby?limit=1 의 가장 가까운 측정소 등급(통합지수 → PM2.5 → PM10 폴백).
// 둘 다 서버 캐시 뒤라 10분 조용한 갱신 + 탭 복귀 재조회.

const RAIN_POP_THRESHOLD = 60;

export const MyLocationChip = ({ className }: { className?: string }) => {
  const { location } = useAirLocation();
  const grid = location ? latLngToKmaGrid(location.lat, location.lng) : null;
  const wxQ = useWeatherNowcast(grid?.nx ?? null, grid?.ny ?? null, { refetchOnWindowFocus: true });
  const airQ = useAirNearbyStations(location?.lat ?? null, location?.lng ?? null, {
    limit: 1,
    radius: 50_000,
    refetchOnWindowFocus: true,
  });
  if (!location) return null;

  const label = location.label ?? '내 위치';
  const ll = `${location.lat.toFixed(5)},${location.lng.toFixed(5)}`;

  // ── 날씨 세그먼트 ──
  const now = wxQ.data?.now ?? null;
  const hours = wxQ.data?.hours ?? [];
  const first = hours[0] ?? null;
  const wxLoading = wxQ.isLoading && !wxQ.data;
  const wxOk = wxLoading || (now !== null && now.t1h !== null);
  const condition = kmaCondition(first?.sky ?? null, now?.pty ?? first?.pty ?? null);
  const ncstHour = wxQ.data?.ncstBase ? Number(wxQ.data.ncstBase.time.slice(0, 2)) : null;
  const pops = hours.map((h) => h.pop).filter((v): v is number => v !== null);
  const popMax = pops.length ? Math.max(...pops) : null;
  const wet = hours.some((h) => (h.pty ?? 0) > 0) || (popMax !== null && popMax >= RAIN_POP_THRESHOLD);
  const temp = now ? `${formatKmaTemp(now.t1h)}°` : '…';
  const wxSummary = wxLoading
    ? '날씨 불러오는 중'
    : wxOk
      ? `날씨 ${formatKmaTemp(now?.t1h)}℃ ${KMA_CONDITION_LABEL[condition]}${popMax !== null ? ` · 앞 6시간 강수확률 최대 ${popMax}%` : ''}${wxQ.data?.ncstBase ? ` (${formatBaseLabel(wxQ.data.ncstBase)} 관측)` : ''}`
      : '날씨 자료 없음';

  // ── 대기 세그먼트 ──
  const nearest = airQ.data?.items[0] ?? null;
  const measure = nearest?.measure ?? null;
  const gradeSource =
    measure?.khaiGrade != null
      ? { grade: measure.khaiGrade, label: '통합지수' }
      : measure?.pm25Grade != null
        ? { grade: measure.pm25Grade, label: 'PM2.5' }
        : measure?.pm10Grade != null
          ? { grade: measure.pm10Grade, label: 'PM10' }
          : null;
  const style = gradeSource ? airGradeStyle(gradeSource.grade) : AIR_GRADE_NONE;
  const airLoading = airQ.isLoading && !airQ.data;
  const airOk = airLoading || nearest !== null;
  const pm25 = measure ? formatAirValue('pm25', measure.pm25) : '-';
  const sidoOption = nearest
    ? (AIR_SIDO_OPTIONS.find((o) => o.value !== '전국' && nearest.sidoName !== null && airSidoMatches(o.value, nearest.sidoName))?.value ?? null)
    : null;
  const airTo = nearest
    ? `/air?${new URLSearchParams({ ...(sidoOption ? { sido: sidoOption } : {}), station: nearest.stationName }).toString()}`
    : '/air';
  const airSummary = airLoading
    ? '대기 불러오는 중'
    : nearest
      ? `대기 ${style.label}(${gradeSource?.label ?? '등급'}) · PM10 ${formatAirValue('pm10', measure?.pm10)} / PM2.5 ${pm25} ㎍/㎥ — 가장 가까운 측정소 ${nearest.stationName} ${formatDistanceM(nearest.dist)}`
      : '근처 측정소 없음';

  const title = `내 위치(${label}) · ${wxSummary} · ${airSummary}`;

  return (
    <div
      data-testid="my-location-chip"
      title={title}
      className={cn(
        'inline-flex h-8 max-w-[22rem] items-stretch overflow-hidden rounded-full border text-xs transition-colors hover:border-foreground/30',
        className,
      )}
    >
      <Link
        to={`/weather?ll=${ll}`}
        aria-label={`내 위치(${label}) 날씨 — ${wxSummary}. 날씨 페이지로 이동`}
        data-testid="weather-location-chip"
        className="inline-flex min-w-0 items-center gap-1.5 pl-2.5 pr-2 transition-colors hover:bg-accent"
      >
        <MapPin aria-hidden className="size-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
        <span className="max-w-[6.5rem] truncate font-medium">{label}</span>
        {wxOk && (
          <>
            {wxLoading ? (
              <span aria-hidden className="size-3.5 shrink-0 animate-pulse rounded-full bg-muted-foreground/30" />
            ) : (
              <WeatherConditionIcon condition={condition} hour={ncstHour} className="size-3.5" />
            )}
            <span className="shrink-0 font-medium tabular-nums">{temp}</span>
            {!wxLoading && <span className="hidden shrink-0 text-muted-foreground md:inline">{KMA_CONDITION_LABEL[condition]}</span>}
            {wet && (
              <Umbrella
                role="img"
                aria-label={`강수 예상${popMax !== null ? ` (최대 ${popMax}%)` : ''}`}
                className="size-3 shrink-0 text-blue-600 dark:text-blue-400"
              />
            )}
          </>
        )}
      </Link>
      {airOk && (
        <Link
          to={airTo}
          aria-label={`내 위치(${label}) 공기질 — ${airSummary}. 대기정보 페이지로 이동`}
          data-testid="air-location-chip"
          // 앞 세그먼트와의 구분은 선이 아니라 가운뎃점 하나 — 두 링크가 한 알약으로 읽히게.
          className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-accent before:pr-1.5 before:text-muted-foreground/60 before:content-['·']"
        >
          <span aria-hidden className={cn('size-2 shrink-0 rounded-full', style.dot, airLoading && 'animate-pulse')} />
          <span className="shrink-0">{airLoading ? '…' : style.label}</span>
          {measure && <span className="hidden shrink-0 text-muted-foreground tabular-nums md:inline">PM2.5 {pm25}</span>}
        </Link>
      )}
    </div>
  );
};
