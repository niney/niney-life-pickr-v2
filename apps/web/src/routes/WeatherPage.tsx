import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, LocateFixed, MapPin, MapPinOff, RefreshCw } from 'lucide-react';
import type { AirLocationItemType } from '@repo/api-contract';
import {
  acquirePosition,
  useAirLocation,
  useWeatherForecast,
  useWeatherMid,
  useWeatherMidSea,
  useWeatherNowcast,
  useWeatherVersions,
} from '@repo/shared';
import {
  WEATHER_DEFAULT_PLACE_ID,
  WEATHER_MID_NATION_STN_ID,
  WEATHER_SIDOS,
  formatDistanceM,
  formatRelativeMin,
  latLngToKmaGrid,
  nearestWeatherPlace,
  parseLatLngParam,
  weatherDefaultPlaceOfSido,
  weatherMidRegionForPlace,
  weatherPlaceById,
  weatherPlaceLabel,
  weatherPlacesBySido,
  type WeatherPlace,
  type WeatherSido,
} from '@repo/utils';
import { Button } from '~/components/ui/button';
import { todayKst } from '~/components/air/airGrade';
import { AirSection, AirStateBlock } from '~/components/air/AirPrimitives';
import { Segmented, WeatherFallbackNote, WeatherStaleNote } from '~/components/weather/WeatherPrimitives';
import { formatBaseLabel, formatTmFcLabel, weatherUpstreamMessage } from '~/components/weather/weatherFormat';
import { WeatherNowHero } from '~/components/weather/WeatherNowHero';
import { WeatherMeteogram } from '~/components/weather/WeatherMeteogram';
import { WeatherDailyStrip } from '~/components/weather/WeatherDailyStrip';
import { WeatherSeaSection } from '~/components/weather/WeatherSeaSection';
import { WeatherVersions } from '~/components/weather/WeatherVersions';
import { WeatherLegend } from '~/components/weather/WeatherLegend';

// 날씨 예시 페이지 — 기상청 단기예보(15084084) 4개 + 중기예보(15059468) 4개 오퍼레이션으로
// 보여줄 수 있는 것을 한 화면에 모두 펼친다. 지점 선택은 URL 에 동기화(?p=지점 id 또는 ?ll=
// 위도,경도)해 새로고침/공유 시 같은 화면이 복원된다(대기정보와 같은 규율: setSearchParams
// 함수형 업데이터 1회, replace).
//
// 지점 해석: 지점(p: 시·군 또는 광역시 구·군) → 청사 좌표 → 격자(nx,ny) + 소속 중기 구역/지점.
// 임의 좌표(ll: GPS) → 격자는 정확히, 중기예보·표시명은 가장 가까운 지점 기준(거리 표기).
// URL 에 아무것도 없고 저장한 내 위치(대기정보·상단바 칩과 공유)가 있으면 그 좌표로 연다 —
// 대기정보 페이지가 저장 위치의 가장 가까운 측정소로 열리는 것과 같은 규율.

// 해역 기본값 — 지점 권역으로 고른다(사용자가 바꾸면 URL ?sea=).
const DEFAULT_SEA_BY_LAND: Record<string, string> = {
  '11B00000': '12A20000',
  '11D10000': '12C20000',
  '11D20000': '12C20000',
  '11C10000': '12A20000',
  '11C20000': '12A20000',
  '11F10000': '12A30000',
  '11F20000': '12B10000',
  '11H10000': '12C10000',
  '11H20000': '12B20000',
  '11G00000': '12B10000',
};

interface ResolvedLocation {
  kind: 'place' | 'coords';
  lat: number;
  lng: number;
  nx: number;
  ny: number;
  // 중기예보·표시명 기준 지점(임의 좌표면 가장 가까운 지점) + 거리.
  place: WeatherPlace;
  distM: number | null;
  // 저장한 내 위치를 기본값으로 연 경우(URL 파라미터 없음).
  fromSaved: boolean;
}

const fromCoords = (lat: number, lng: number, fromSaved: boolean): ResolvedLocation => {
  const nearest = nearestWeatherPlace(lat, lng);
  const place = nearest?.place ?? weatherPlaceById(WEATHER_DEFAULT_PLACE_ID)!;
  const grid = latLngToKmaGrid(lat, lng);
  return { kind: 'coords', lat, lng, nx: grid.nx, ny: grid.ny, place, distM: nearest?.distM ?? null, fromSaved };
};

const resolveLocation = (pParam: string | null, llParam: string | null, saved: AirLocationItemType | null): ResolvedLocation => {
  const ll = parseLatLngParam(llParam);
  if (ll) return fromCoords(ll.lat, ll.lng, false);
  const place = weatherPlaceById(pParam);
  if (place) {
    const grid = latLngToKmaGrid(place.lat, place.lng);
    return { kind: 'place', lat: place.lat, lng: place.lng, nx: grid.nx, ny: grid.ny, place, distM: null, fromSaved: false };
  }
  if (!pParam && saved) return fromCoords(saved.lat, saved.lng, true);
  const fallback = weatherPlaceById(WEATHER_DEFAULT_PLACE_ID)!;
  const grid = latLngToKmaGrid(fallback.lat, fallback.lng);
  return { kind: 'place', lat: fallback.lat, lng: fallback.lng, nx: grid.nx, ny: grid.ny, place: fallback, distM: null, fromSaved: false };
};

type OutlookScope = 'region' | 'nation';

export const WeatherPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const todayYmd = todayKst();

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // 저장한 내 위치(대기정보·상단바 칩과 공유, 로그인 서버/게스트 로컬).
  const airLocation = useAirLocation();
  const saved = airLocation.location;

  // URL 이 유일한 진실 — 없으면 저장 위치, 그것도 없으면 서울.
  const loc = resolveLocation(searchParams.get('p'), searchParams.get('ll'), saved);
  // 지금 보는 지점이 저장 위치와 같은가(좌표 근사 ≈50m) — 저장 버튼/해제 분기.
  const savedHere =
    saved !== null && Math.abs(saved.lat - loc.lat) < 0.0005 && Math.abs(saved.lng - loc.lng) < 0.0005;
  const midRegion = weatherMidRegionForPlace(loc.place);
  const landRegId = midRegion?.land.regId ?? null;
  const stnId = midRegion?.stnId ?? null;
  const taPlaceName = weatherPlaceById(loc.place.taRegId)?.name ?? loc.place.name;
  const seaParam = searchParams.get('sea');
  const seaRegId = seaParam && /^12[A-G]\d{5}$/.test(seaParam) ? seaParam : (DEFAULT_SEA_BY_LAND[landRegId ?? ''] ?? '12A20000');
  const [outlookScope, setOutlookScope] = useState<OutlookScope>('region');
  const [locating, setLocating] = useState<'idle' | 'pending' | 'denied' | 'timeout' | 'unavailable'>('idle');

  // ── 조회 ──
  const nowcastQ = useWeatherNowcast(loc.nx, loc.ny);
  const forecastQ = useWeatherForecast(loc.nx, loc.ny);
  const midQ = useWeatherMid(landRegId, loc.place.taRegId, stnId);
  // 전국 전망은 토글했을 때만(같은 육상/기온 + stn=108 — 서버 캐시 키가 달라 업스트림 2콜 추가).
  const nationQ = useWeatherMid(outlookScope === 'nation' ? landRegId : null, loc.place.taRegId, WEATHER_MID_NATION_STN_ID);
  const seaQ = useWeatherMidSea(seaRegId);
  const versionsQ = useWeatherVersions();

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['weather'] });
  const anyFetching = nowcastQ.isFetching || forecastQ.isFetching || midQ.isFetching || seaQ.isFetching || versionsQ.isFetching;

  const locate = async () => {
    setLocating('pending');
    const r = await acquirePosition({ timeout: 10_000, maxTries: 2 });
    if (!r) return;
    if (r.status === 'granted') {
      setLocating('idle');
      setParams({ ll: `${r.coords.lat.toFixed(5)},${r.coords.lng.toFixed(5)}`, p: null });
    } else {
      setLocating(r.status);
    }
  };
  const selectPlace = (id: string) => setParams({ p: id, ll: null });
  const selectSido = (sido: WeatherSido) => {
    const first = weatherDefaultPlaceOfSido(sido);
    if (first) selectPlace(first.id);
  };
  const saveHere = () =>
    airLocation.save({
      lat: loc.lat,
      lng: loc.lng,
      // 라벨은 항상 채운다 — 지점이면 그 이름, 좌표면 가장 가까운 지점 이름(대기정보 카드·
      // 상단바 툴팁이 같은 라벨을 쓴다).
      label: loc.place.name,
      source: loc.kind === 'place' ? 'place' : 'geolocation',
    });

  const nearestLabel = weatherPlaceLabel(loc.place);
  const placeLabel =
    loc.kind === 'place'
      ? nearestLabel
      : savedHere
        ? `내 위치(${saved?.label ?? nearestLabel})`
        : `내 위치 · ${nearestLabel} 기준${loc.distM !== null ? ` (${formatDistanceM(loc.distM)})` : ''}`;
  const fetchedLabel = nowcastQ.data?.fetchedAt ? formatRelativeMin(nowcastQ.data.fetchedAt) : null;
  const locateHint =
    locating === 'denied'
      ? '위치 권한이 꺼져 있습니다. 브라우저 주소창의 위치 아이콘에서 허용해 주세요.'
      : locating === 'timeout'
        ? '위치를 가져오는 데 시간이 걸립니다. 다시 눌러 주세요.'
        : locating === 'unavailable'
          ? '이 환경에서는 위치를 가져올 수 없습니다(HTTPS 또는 localhost 필요).'
          : null;
  const outlookActive = outlookScope === 'nation' ? nationQ : midQ;
  const sidoPlaces = weatherPlacesBySido(loc.place.sido);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-5">
        {/* 머리 + 지점 컨트롤 */}
        <header className="flex flex-col gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">날씨</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              기상청 단기예보·중기예보 API 두 개로 보여줄 수 있는 것들 — 지금 실황과 6시간, 3일 시간별, 열흘, 중기전망,
              해상예보, 발표 정보.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm">
              <span className="text-xs text-muted-foreground">시도</span>
              <select
                value={loc.place.sido}
                onChange={(e) => selectSido(e.target.value as WeatherSido)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                aria-label="시도 선택"
              >
                {WEATHER_SIDOS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <span className="text-xs text-muted-foreground">지점</span>
              <select
                value={loc.kind === 'place' ? loc.place.id : ''}
                onChange={(e) => selectPlace(e.target.value)}
                className="h-9 max-w-[14rem] rounded-md border border-input bg-background px-2 text-sm"
                aria-label="지점 선택"
              >
                {loc.kind === 'coords' && <option value="">{placeLabel}</option>}
                {sidoPlaces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.kind === 'city' && p.id === weatherDefaultPlaceOfSido(p.sido)?.id && sidoPlaces.length > 1 ? `${p.name} (전체)` : p.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" variant="outline" size="sm" onClick={locate} disabled={locating === 'pending'}>
              {locating === 'pending' ? <Loader2 className="animate-spin" /> : <LocateFixed />}
              내 위치
            </Button>
            {saved && !savedHere && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                title={`저장한 내 위치(${saved.label ?? '저장 지점'})로 보기 — 상단바 칩·대기정보 페이지와 같은 지점`}
                onClick={() => setParams({ ll: `${saved.lat.toFixed(5)},${saved.lng.toFixed(5)}`, p: null })}
              >
                <MapPin /> 저장한 내 위치{saved.label ? `(${saved.label})` : ''}
              </Button>
            )}
            {/* 이 지점을 내 위치로 저장 — 대기정보와 같은 저장소(로그인 서버/게스트 로컬). 저장하면
                상단바 "내 위치" 칩(날씨+대기)이 이 지점으로 뜨고 대기정보 페이지도 여기로 열린다. */}
            {savedHere ? (
              <>
                <Button type="button" variant="secondary" size="sm" disabled title="이 지점이 내 위치로 저장되어 있습니다(상단바 칩·대기정보와 공유)">
                  <Check /> 내 위치로 저장됨
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={airLocation.isSaving}
                  onClick={() => airLocation.clear()}
                  aria-label="내 위치 해제"
                  title="저장한 내 위치를 지웁니다 — 상단바 칩이 사라지고 대기정보도 기본 지점으로 돌아갑니다"
                >
                  <MapPinOff /> 해제
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={airLocation.isSaving}
                title="이 지점을 내 위치로 저장합니다 — 상단바에 날씨·대기 칩이 뜨고, 대기정보 페이지도 이 지점을 기본으로 엽니다"
                onClick={saveHere}
              >
                {airLocation.isSaving ? <Loader2 className="animate-spin" /> : <MapPin />}
                이 지점을 내 위치로 저장
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              격자 ({loc.nx},{loc.ny}) · 중기 {midRegion?.land.label ?? '-'} / {taPlaceName}
            </span>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              {fetchedLabel && (
                <span className="tabular-nums">
                  갱신 {fetchedLabel}
                  {nowcastQ.data?.stale && <span className="ml-1 text-amber-600 dark:text-amber-400">(저장본)</span>}
                </span>
              )}
              <Button type="button" variant="outline" size="sm" onClick={refreshAll} disabled={anyFetching}>
                {anyFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                새로고침
              </Button>
            </div>
          </div>
          {locateHint && <p className="text-xs text-amber-700 dark:text-amber-300">{locateHint}</p>}
        </header>

        {/* ① 지금 */}
        <AirSection
          id="weather-now"
          title={`지금 · ${placeLabel}`}
          op="getUltraSrtNcst + getUltraSrtFcst"
          opLabel="초단기실황 · 초단기예보"
          description="정시 관측 8항목(기온·1시간 강수량·습도·강수형태·풍향·풍속·동서/남북 성분)과 앞으로 6시간의 시각별 예보(기온·하늘·강수형태·강수확률·강수량·습도·바람·낙뢰)."
        >
          {nowcastQ.data?.stale && <WeatherStaleNote fetchedAtLabel={formatRelativeMin(nowcastQ.data.fetchedAt)} />}
          {nowcastQ.data && !nowcastQ.data.stale && (nowcastQ.data.ncstFallback || nowcastQ.data.ultraFallback) && (
            <WeatherFallbackNote
              what={nowcastQ.data.ncstFallback ? '초단기실황' : '초단기예보'}
              baseLabel={formatBaseLabel(nowcastQ.data.ncstFallback ? nowcastQ.data.ncstBase : nowcastQ.data.ultraBase)}
            />
          )}
          {nowcastQ.isLoading && !nowcastQ.data ? (
            <AirStateBlock kind="loading" />
          ) : nowcastQ.isError && (!nowcastQ.data || nowcastQ.isPlaceholderData) ? (
            <AirStateBlock
              kind="error"
              message={weatherUpstreamMessage(nowcastQ.error, '실황을 불러오지 못했습니다.')}
              onRetry={() => nowcastQ.refetch()}
              retrying={nowcastQ.isFetching}
            />
          ) : nowcastQ.data ? (
            <WeatherNowHero data={nowcastQ.data} placeLabel={placeLabel} dim={nowcastQ.isPlaceholderData} />
          ) : null}
        </AirSection>

        {/* ② 3일 시간별 */}
        <AirSection
          title="3일 시간별"
          op="getVilageFcst"
          opLabel="단기예보"
          description={`발표 시각 +1시간부터 3일치 시각별 14항목. 위 아이콘 행은 하늘·강수형태, 선은 기온, 막대는 강수확률(막대 위 글자는 강수량 범주). 선 위에 마우스를 올리거나 ←/→ 로 값을 읽을 수 있고 표로도 볼 수 있습니다.${forecastQ.data?.base ? ` 현재 ${formatBaseLabel(forecastQ.data.base)} 발표분.` : ''}`}
        >
          {forecastQ.data?.stale && <WeatherStaleNote fetchedAtLabel={formatRelativeMin(forecastQ.data.fetchedAt)} />}
          {forecastQ.data && !forecastQ.data.stale && forecastQ.data.fallback && (
            <WeatherFallbackNote what="단기예보" baseLabel={formatBaseLabel(forecastQ.data.base)} />
          )}
          {forecastQ.isLoading && !forecastQ.data ? (
            <AirStateBlock kind="loading" />
          ) : forecastQ.isError && (!forecastQ.data || forecastQ.isPlaceholderData) ? (
            <AirStateBlock
              kind="error"
              message={weatherUpstreamMessage(forecastQ.error, '단기예보를 불러오지 못했습니다.')}
              onRetry={() => forecastQ.refetch()}
              retrying={forecastQ.isFetching}
            />
          ) : (
            <WeatherMeteogram hours={forecastQ.data?.hours ?? []} todayYmd={todayYmd} dim={forecastQ.isPlaceholderData} />
          )}
        </AirSection>

        {/* ③ 열흘 */}
        <AirSection
          title="열흘"
          op="getVilageFcst + getMidLandFcst + getMidTa"
          opLabel="단기예보 일별 요약 · 중기육상예보 · 중기기온"
          description={`오늘부터 3일은 단기예보를 하루 단위로 접은 값(오전/오후 대표 날씨·최대 강수확률·일 최저/최고), 그 뒤는 중기예보(발표일 +4~+10일 — ${midRegion?.land.label ?? '-'} 권역 날씨·강수확률, ${taPlaceName} 기온과 예측 오차${loc.place.kind === 'district' ? ` — 구·군은 소속 광역시 지점`  : ''}). 기온 막대는 전체 기간 최저~최고 축 위의 위치입니다.`}
        >
          {midQ.data?.stale && <WeatherStaleNote fetchedAtLabel={formatRelativeMin(midQ.data.fetchedAt)} />}
          {midQ.data && !midQ.data.stale && midQ.data.fallback && (
            <WeatherFallbackNote what="중기예보" baseLabel={formatTmFcLabel(midQ.data.tmFc)} />
          )}
          {forecastQ.isLoading && midQ.isLoading && !forecastQ.data && !midQ.data ? (
            <AirStateBlock kind="loading" />
          ) : forecastQ.isError && midQ.isError && !forecastQ.data && !midQ.data ? (
            <AirStateBlock
              kind="error"
              message={weatherUpstreamMessage(midQ.error, '예보를 불러오지 못했습니다.')}
              onRetry={() => {
                void forecastQ.refetch();
                void midQ.refetch();
              }}
              retrying={forecastQ.isFetching || midQ.isFetching}
            />
          ) : (
            <>
              {midQ.isError && !midQ.data && (
                <div className="mb-3 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                  {weatherUpstreamMessage(midQ.error, '중기예보를 불러오지 못해 단기예보 3일만 표시합니다.')}
                </div>
              )}
              <WeatherDailyStrip
                shortDays={forecastQ.data?.days ?? []}
                mid={midQ.data ?? null}
                todayYmd={todayYmd}
                dim={forecastQ.isPlaceholderData || midQ.isPlaceholderData}
              />
            </>
          )}
        </AirSection>

        {/* ④ 중기전망 */}
        <AirSection
          title="중기전망"
          op="getMidFcst"
          opLabel="중기전망조회 (wfSv)"
          description={`예보관이 쓴 전망 원문 — 권역(${midRegion?.land.label ?? '-'}, stnId ${stnId ?? '-'}) 또는 전국(108). ${outlookActive.data?.tmFc ? `${formatTmFcLabel(outlookActive.data.tmFc)} 발표.` : ''}`}
          aside={
            <Segmented
              value={outlookScope}
              options={[
                { value: 'region', label: '권역' },
                { value: 'nation', label: '전국' },
              ]}
              onChange={setOutlookScope}
              ariaLabel="전망 범위"
            />
          }
        >
          {outlookActive.isLoading && !outlookActive.data ? (
            <AirStateBlock kind="loading" />
          ) : outlookActive.isError && !outlookActive.data ? (
            <AirStateBlock
              kind="error"
              message={weatherUpstreamMessage(outlookActive.error, '중기전망을 불러오지 못했습니다.')}
              onRetry={() => outlookActive.refetch()}
              retrying={outlookActive.isFetching}
            />
          ) : outlookActive.data?.outlook ? (
            <p className="whitespace-pre-line rounded-md border bg-muted/30 px-3 py-2.5 text-sm leading-relaxed">
              {outlookActive.data.outlook.text}
            </p>
          ) : (
            <AirStateBlock kind="empty" message="이 발표분의 중기전망 원문이 없습니다." />
          )}
        </AirSection>

        {/* ⑤ 해상 */}
        <AirSection
          title="중기해상예보"
          op="getMidSeaFcst"
          opLabel="중기해상예보조회"
          description="12개 해역의 발표일 +4~+10일 날씨와 파고(최저~최고 m). 기본 해역은 선택 지점의 권역에 가까운 바다."
        >
          {seaQ.data?.stale && <WeatherStaleNote fetchedAtLabel={formatRelativeMin(seaQ.data.fetchedAt)} />}
          {seaQ.isLoading && !seaQ.data ? (
            <AirStateBlock kind="loading" />
          ) : seaQ.isError && (!seaQ.data || seaQ.isPlaceholderData) ? (
            <AirStateBlock
              kind="error"
              message={weatherUpstreamMessage(seaQ.error, '해상예보를 불러오지 못했습니다.')}
              onRetry={() => seaQ.refetch()}
              retrying={seaQ.isFetching}
            />
          ) : (
            <WeatherSeaSection
              regId={seaRegId}
              onChangeRegion={(id) => setParams({ sea: id })}
              data={seaQ.data ?? null}
              todayYmd={todayYmd}
              dim={seaQ.isPlaceholderData}
            />
          )}
        </AirSection>

        {/* ⑥ 발표 정보 */}
        <AirSection
          title="발표 정보"
          op="getFcstVersion"
          opLabel="예보버전조회 (ODAM · VSRT · SHRT)"
          description="이 화면이 쓰는 발표 기준 시각과 기상청이 말하는 파일 생성 시각. 새 슬롯이 아직 없으면 직전 발표분을, 기상청이 응답하지 않으면 저장본을 표시합니다."
        >
          {versionsQ.isError && !versionsQ.data && (
            <div className="mb-3 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              {weatherUpstreamMessage(versionsQ.error, '예보 버전을 불러오지 못했습니다.')}
            </div>
          )}
          <WeatherVersions
            versions={versionsQ.data ?? null}
            nowcast={nowcastQ.data ?? null}
            forecast={forecastQ.data ?? null}
            mid={midQ.data ?? null}
          />
        </AirSection>

        {/* ⑦ 코드표·출처 */}
        <AirSection title="코드표와 출처" op="SKY · PTY · category" opLabel="코드 · 단위 · 공공누리 출처표시">
          <WeatherLegend />
        </AirSection>
      </div>
    </div>
  );
};
