import { Link } from 'react-router-dom';
import { MapPin, Umbrella } from 'lucide-react';
import { GLANCE_AIR_GRADE_SOURCE_LABEL, useMyLocationGlance } from '@repo/shared';
import { AIR_SIDO_OPTIONS, airSidoMatches, formatAirValue, formatDistanceM, formatKmaTemp } from '@repo/utils';
import { cn } from '~/lib/utils';
import { AIR_GRADE_NONE, airGradeStyle } from '~/components/air/airGrade';
import { formatBaseLabel } from './weatherFormat';
import { WeatherConditionIcon } from './weatherIcons';

// 상단바 "내 위치" 칩 — 저장한 내 위치(대기정보·날씨 페이지에서 저장, 로그인 서버·게스트 로컬)
// 하나를 알약 하나에: [📍라벨 ☁기온 상태 ☂] · [●등급 PM2.5]. 경계선 없이 두 클릭 영역만 —
// 왼쪽(라벨+날씨) → /weather, 오른쪽(대기) → /air. 위치 이름은 앞에 한 번만(두 반쪽이 따로
// 노는 느낌을 없앤다). 저장 위치가 없으면 아무것도 그리지 않는다(강요 없음).
// 파생값(기온·상태·우산·등급·가장 가까운 측정소)은 앱 홈 카드와 공용 훅(useMyLocationGlance)에서.
//
// 폭에 따라 단계적으로 펼친다(상단바 폭 예산은 PublicTopBar 메모 참고):
//   <sm : [📍 ☁26° ☂ · ●좋음] — 라벨 글자·기온 소수점 없이(라벨은 aria/title 에). 360px 에서
//         '매우나쁨'까지 한 줄에 들어가는 폭(~190px)이 기준.
//   sm+ : + 위치 라벨(최대 6.5rem, 말줄임) · 기온 소수 1자리.
//   lg+ : + 하늘 상태 글자 · PM2.5 수치.
// 한쪽 자료를 못 받으면 그 세그먼트만 조용히 빠지고 알약은 그대로(칩은 경고하는 자리가 아니다).
// 대기는 측정소가 없을 때만이 아니라, 측정소는 있어도 측정값(등급)이 없을 때도 빠진다 —
// 업스트림 장애 때 "● -" 를 남기지 않는다.

export const MyLocationChip = ({ className }: { className?: string }) => {
  const { location, label, weather: wx, air } = useMyLocationGlance({ refetchOnWindowFocus: true });
  if (!location) return null;

  const ll = `${location.lat.toFixed(5)},${location.lng.toFixed(5)}`;

  // ── 날씨 세그먼트 ──
  const temp = wx.loading ? '…' : `${formatKmaTemp(wx.tempC)}°`;
  // <sm 컴팩트 표기 — 26.3° → 26°.
  const tempShort = wx.loading ? '…' : `${formatKmaTemp(wx.tempC === null ? null : Math.round(wx.tempC))}°`;
  const wxSummary = wx.loading
    ? '날씨 불러오는 중'
    : wx.ok
      ? `날씨 ${formatKmaTemp(wx.tempC)}℃ ${wx.conditionLabel}${wx.popMax !== null ? ` · 앞 6시간 강수확률 최대 ${wx.popMax}%` : ''}${wx.ncstBase ? ` (${formatBaseLabel(wx.ncstBase)} 관측)` : ''}`
      : '날씨 자료 없음';

  // ── 대기 세그먼트 ──
  const style = air.grade !== null ? airGradeStyle(air.grade) : AIR_GRADE_NONE;
  const nearest = air.station;
  const pm25 = formatAirValue('pm25', air.pm25);
  const sidoOption = nearest
    ? (AIR_SIDO_OPTIONS.find((o) => o.value !== '전국' && nearest.sidoName !== null && airSidoMatches(o.value, nearest.sidoName))?.value ?? null)
    : null;
  const airTo = nearest
    ? `/air?${new URLSearchParams({ ...(sidoOption ? { sido: sidoOption } : {}), station: nearest.stationName }).toString()}`
    : '/air';
  const nearestLabel = nearest ? `가장 가까운 측정소 ${nearest.stationName} ${formatDistanceM(nearest.dist)}` : '';
  const airSummary = air.loading
    ? '대기 불러오는 중'
    : !nearest
      ? '근처 측정소 없음'
      : air.gradeSource === null
        ? `대기 자료 없음 — ${nearestLabel}`
        : `대기 ${style.label}(${GLANCE_AIR_GRADE_SOURCE_LABEL[air.gradeSource]}) · PM10 ${formatAirValue('pm10', air.pm10)} / PM2.5 ${pm25} ㎍/㎥ — ${nearestLabel}`;

  const title = `내 위치(${label}) · ${wxSummary} · ${airSummary}`;

  return (
    <div
      data-testid="my-location-chip"
      title={title}
      className={cn(
        'inline-flex h-8 min-w-0 max-w-[22rem] items-stretch overflow-hidden rounded-full border text-xs transition-colors hover:border-foreground/30',
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
        <span className="hidden max-w-[6.5rem] truncate font-medium sm:inline">{label}</span>
        {wx.ok && (
          <>
            {wx.loading ? (
              <span aria-hidden className="size-3.5 shrink-0 animate-pulse rounded-full bg-muted-foreground/30" />
            ) : (
              <WeatherConditionIcon condition={wx.condition} hour={wx.ncstHour} className="size-3.5" />
            )}
            <span className="shrink-0 font-medium tabular-nums sm:hidden">{tempShort}</span>
            <span className="hidden shrink-0 font-medium tabular-nums sm:inline">{temp}</span>
            {!wx.loading && <span className="hidden shrink-0 text-muted-foreground lg:inline">{wx.conditionLabel}</span>}
            {wx.wet && (
              <Umbrella
                role="img"
                aria-label={`강수 예상${wx.popMax !== null ? ` (최대 ${wx.popMax}%)` : ''}`}
                className="size-3 shrink-0 text-blue-600 dark:text-blue-400"
              />
            )}
          </>
        )}
      </Link>
      {air.ok && (
        <Link
          to={airTo}
          aria-label={`내 위치(${label}) 공기질 — ${airSummary}. 대기정보 페이지로 이동`}
          data-testid="air-location-chip"
          // 앞 세그먼트와의 구분은 선이 아니라 가운뎃점 하나 — 두 링크가 한 알약으로 읽히게.
          className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-accent before:pr-1.5 before:text-muted-foreground/60 before:content-['·']"
        >
          <span aria-hidden className={cn('size-2 shrink-0 rounded-full', style.dot, air.loading && 'animate-pulse')} />
          <span className="shrink-0">{air.loading ? '…' : style.label}</span>
          {air.grade !== null && <span className="hidden shrink-0 text-muted-foreground tabular-nums lg:inline">PM2.5 {pm25}</span>}
        </Link>
      )}
    </div>
  );
};
