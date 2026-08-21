import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, LocateFixed, RefreshCw, Wind } from 'lucide-react';
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
  WEATHER_MID_LAND_REGIONS,
  WEATHER_MID_NATION_STN_ID,
  WEATHER_PLACES,
  formatDistanceM,
  formatRelativeMin,
  latLngToKmaGrid,
  nearestWeatherPlace,
  parseLatLngParam,
  weatherMidRegionForPlace,
  weatherPlaceById,
  type WeatherPlace,
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
// 보여줄 수 있는 것을 한 화면에 모두 펼친다. 지점 선택은 URL 에 동기화(?p=중기기온 regId
// 또는 ?ll=위도,경도)해 새로고침/공유 시 같은 화면이 복원된다(대기정보와 같은 규율:
// setSearchParams 함수형 업데이터 1회, replace).
//
// 지점 해석: 지점(p) → 그 시·군청 좌표 → 격자(nx,ny) + 소속 중기 구역. 임의 좌표(ll: GPS·
// 내 대기 위치) → 격자는 정확히, 중기예보는 가장 가까운 지점 기준(거리 표기).

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
  // 중기예보 기준 지점(임의 좌표면 가장 가까운 지점) + 거리.
  place: WeatherPlace;
  distM: number | null;
  label: string;
}

const resolveLocation = (pParam: string | null, llParam: string | null): ResolvedLocation => {
  const ll = parseLatLngParam(llParam);
  if (ll) {
    const nearest = nearestWeatherPlace(ll.lat, ll.lng);
    const place = nearest?.place ?? weatherPlaceById(WEATHER_DEFAULT_PLACE_ID)!;
    const grid = latLngToKmaGrid(ll.lat, ll.lng);
    return {
      kind: 'coords',
      lat: ll.lat,
      lng: ll.lng,
      nx: grid.nx,
      ny: grid.ny,
      place,
      distM: nearest?.distM ?? null,
      label: `내 위치`,
    };
  }
  const place = weatherPlaceById(pParam) ?? weatherPlaceById(WEATHER_DEFAULT_PLACE_ID)!;
  const grid = latLngToKmaGrid(place.lat, place.lng);
  return { kind: 'place', lat: place.lat, lng: place.lng, nx: grid.nx, ny: grid.ny, place, distM: null, label: place.name };
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

  // URL 이 유일한 진실.
  const loc = resolveLocation(searchParams.get('p'), searchParams.get('ll'));
  const midRegion = weatherMidRegionForPlace(loc.place);
  const landRegId = midRegion?.land.regId ?? null;
  const stnId = midRegion?.stnId ?? null;
  const seaParam = searchParams.get('sea');
  const seaRegId = seaParam && /^12[A-G]\d{5}$/.test(seaParam) ? seaParam : (DEFAULT_SEA_BY_LAND[landRegId ?? ''] ?? '12A20000');
  const [outlookScope, setOutlookScope] = useState<OutlookScope>('region');
  const [locating, setLocating] = useState<'idle' | 'pending' | 'denied' | 'timeout' | 'unavailable'>('idle');

  // 내 대기 위치(저장 지점) — 있으면 한 번에 그 좌표로.
  const airLocation = useAirLocation();

  // ── 조회 ──
  const nowcastQ = useWeatherNowcast(loc.nx, loc.ny);
  const forecastQ = useWeatherForecast(loc.nx, loc.ny);
  const midQ = useWeatherMid(landRegId, loc.place.id, stnId);
  // 전국 전망은 토글했을 때만(같은 육상/기온 + stn=108 — 서버 캐시 키가 달라 업스트림 2콜 추가).
  const nationQ = useWeatherMid(outlookScope === 'nation' ? landRegId : null, loc.place.id, WEATHER_MID_NATION_STN_ID);
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

  const placeLabel =
    loc.kind === 'coords'
      ? `내 위치 · ${loc.place.name} 기준${loc.distM !== null ? ` (${formatDistanceM(loc.distM)})` : ''}`
      : loc.place.name;
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
              <span className="text-xs text-muted-foreground">지점</span>
              <select
                value={loc.kind === 'place' ? loc.place.id : ''}
                onChange={(e) => selectPlace(e.target.value)}
                className="h-9 max-w-[14rem] rounded-md border border-input bg-background px-2 text-sm"
                aria-label="지점 선택"
              >
                {loc.kind === 'coords' && <option value="">내 위치 ({loc.place.name} 기준)</option>}
                {WEATHER_MID_LAND_REGIONS.map((region) => (
                  <optgroup key={region.regId} label={region.label}>
                    {WEATHER_PLACES.filter((p) => p.landRegId === region.regId).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <Button type="button" variant="outline" size="sm" onClick={locate} disabled={locating === 'pending'}>
              {locating === 'pending' ? <Loader2 className="animate-spin" /> : <LocateFixed />}
              내 위치
            </Button>
            {airLocation.location && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                title={`대기정보에 저장한 내 대기 위치(${airLocation.location.label ?? '저장 지점'})로 보기`}
                onClick={() =>
                  setParams({ ll: `${airLocation.location!.lat.toFixed(5)},${airLocation.location!.lng.toFixed(5)}`, p: null })
                }
              >
                <Wind /> 내 대기 위치{airLocation.location.label ? `(${airLocation.location.label})` : ''}
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              격자 ({loc.nx},{loc.ny}) · 중기 {midRegion?.land.label ?? '-'} / {loc.place.name}
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
          description={`오늘부터 3일은 단기예보를 하루 단위로 접은 값(오전/오후 대표 날씨·최대 강수확률·일 최저/최고), 그 뒤는 중기예보(발표일 +4~+10일 — ${midRegion?.land.label ?? '-'} 권역 날씨·강수확률, ${loc.place.name} 기온과 예측 오차). 기온 막대는 전체 기간 최저~최고 축 위의 위치입니다.`}
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
