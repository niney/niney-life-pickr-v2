import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import type { AirForecastCodeType, AirHistoryTermType } from '@repo/api-contract';
import {
  ApiError,
  useAirBadStations,
  useAirForecast,
  useAirSidoRealtime,
  useAirStationHistory,
  useAirStations,
  useAirWeeklyForecast,
} from '@repo/shared';
import { AIR_HISTORY_TERMS, AIR_FORECAST_CODES } from '@repo/api-contract';
import { AIR_SIDO_OPTIONS, formatRelativeMin } from '@repo/utils';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { todayKst } from '~/components/air/airGrade';
import { AirSection, AirStaleNote, AirStateBlock } from '~/components/air/AirPrimitives';
import { AirStationHero } from '~/components/air/AirStationHero';
import { AirHourStrip } from '~/components/air/AirHourStrip';
import { AirHistoryChart } from '~/components/air/AirHistoryChart';
import { AIR_CHART_METRICS, AIR_FORECAST_TABS, type AirChartMetric } from '~/components/air/airOptions';
import { AirSidoTable } from '~/components/air/AirSidoTable';
import { AirSidoCompare } from '~/components/air/AirSidoCompare';
import { AirBadStations } from '~/components/air/AirBadStations';
import { AirForecastSection } from '~/components/air/AirForecastSection';
import { AirWeeklySection } from '~/components/air/AirWeeklySection';
import { AirLegend } from '~/components/air/AirLegend';
import { AirNearbySection, AirStationsErrorBlock } from '~/components/air/AirNearbySection';

// 대기정보 예시 페이지 — 에어코리아 대기오염정보 API(15073861) 5개 오퍼레이션으로
// 보여줄 수 있는 것을 한 화면에 모두 펼친다. 선택(시도·측정소·기간·예보항목)은
// URL 에 동기화해 새로고침/공유 시 같은 화면이 복원된다(버스/지하철과 같은 규율:
// setSearchParams 함수형 업데이터 1회 호출, replace).
//
// 데이터 흐름: 시도별(전국 캐시 필터) → 측정소 목록 → 선택 측정소의 시계열(DAILY 는
// 히어로·띠·차트 공용, MONTH/3MONTH 는 차트만) + 나쁨 이상·예보·주간예보는 전역.

const DEFAULT_SIDO = '서울';
const TERM_LABEL: Record<AirHistoryTermType, string> = {
  DAILY: '24시간',
  MONTH: '30일',
  '3MONTH': '90일',
};

const isTerm = (v: string | null): v is AirHistoryTermType =>
  v !== null && (AIR_HISTORY_TERMS as readonly string[]).includes(v);
const isCode = (v: string | null): v is AirForecastCodeType =>
  v !== null && (AIR_FORECAST_CODES as readonly string[]).includes(v);

const upstreamMessage = (e: unknown, fallback: string): string => {
  if (e instanceof ApiError) {
    if (e.statusCode === 503) return `서버에 에어코리아 API 키가 없거나 일일 한도가 찼습니다. (${e.message})`;
    if (e.statusCode === 502) return `에어코리아 API가 응답하지 않습니다. 잠시 후 다시 시도하세요. (${e.message})`;
    if (e.statusCode === 429) return '요청이 너무 잦습니다. 잠시 후 다시 시도하세요.';
  }
  return fallback;
};

export const AirQualityPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // URL 이 유일한 진실 — 유효하지 않은 값은 기본값으로 읽는다(URL 은 건드리지 않음).
  const sidoParam = searchParams.get('sido');
  const sido = AIR_SIDO_OPTIONS.some((o) => o.value === sidoParam) ? (sidoParam as string) : DEFAULT_SIDO;
  const stationParam = searchParams.get('station');
  const term: AirHistoryTermType = isTerm(searchParams.get('term')) ? (searchParams.get('term') as AirHistoryTermType) : 'DAILY';
  const code: AirForecastCodeType = isCode(searchParams.get('code')) ? (searchParams.get('code') as AirForecastCodeType) : 'PM10';

  // 차트 항목/전국 비교 항목은 공유 가치가 낮아 로컬 상태.
  const [metric, setMetric] = useState<AirChartMetric>('pm');
  const [compareMetric, setCompareMetric] = useState<'pm10' | 'pm25'>('pm25');

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

  const todayYmd = todayKst();

  // ── 조회 ────────────────────────────────────────────────────────────────
  const sidoQ = useAirSidoRealtime(sido);
  // 전국 비교용 — 선택 시도가 전국이면 같은 쿼리를 재사용(키 동일).
  const nationQ = useAirSidoRealtime(sido === '전국' ? null : '전국');
  const nationItems = sido === '전국' ? sidoQ.data?.items : nationQ.data?.items;

  const stations = (sidoQ.data?.items ?? [])
    .map((m) => m.stationName)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort((a, b) => a.localeCompare(b, 'ko'));
  // 선택 측정소 — URL 값이 목록에 있으면 그것, 아니면 목록 첫 번째(URL 은 그대로 둔다).
  const station = stationParam && stations.includes(stationParam) ? stationParam : (stations[0] ?? null);

  const dailyQ = useAirStationHistory(station, 'DAILY');
  const historyQ = useAirStationHistory(station, term);
  const badQ = useAirBadStations();
  const forecastQ = useAirForecast();
  const weeklyQ = useAirWeeklyForecast();
  // 측정소 좌표(별도 API) — 지도·내 주변·검색. 활용신청 전이면 503 이 오고 섹션이 안내한다.
  const stationsQ = useAirStations();

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['air'] });
  const anyFetching =
    sidoQ.isFetching || dailyQ.isFetching || historyQ.isFetching || badQ.isFetching || forecastQ.isFetching || weeklyQ.isFetching;

  const selectStation = (name: string, sidoValue?: string | null) => {
    if (sidoValue && sidoValue !== sido) setParams({ sido: sidoValue, station: name });
    else setParams({ station: name });
    document.getElementById('air-now')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const selectSido = (value: string) => setParams({ sido: value, station: null });

  const latest = dailyQ.data?.latest ?? null;
  const fetchedLabel = sidoQ.data?.fetchedAt ? formatRelativeMin(sidoQ.data.fetchedAt) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-5">
        {/* 머리 + 컨트롤(한 줄, 아래 모든 섹션의 범위) */}
        <header className="flex flex-col gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">대기정보</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              한국환경공단 에어코리아 대기오염정보 API 하나로 보여줄 수 있는 것들 — 지금 공기, 24시간 추이,
              시도·전국 현황, 나쁨 지역, 예보와 주간예보.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm">
              <span className="text-xs text-muted-foreground">시도</span>
              <select
                value={sido}
                onChange={(e) => selectSido(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {AIR_SIDO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <span className="text-xs text-muted-foreground">측정소</span>
              <select
                value={station ?? ''}
                onChange={(e) => setParams({ station: e.target.value })}
                disabled={stations.length === 0}
                className="h-9 max-w-[12rem] rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
              >
                {stations.length === 0 && <option value="">측정소 불러오는 중…</option>}
                {stations.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              {fetchedLabel && (
                <span className="tabular-nums">
                  갱신 {fetchedLabel}
                  {sidoQ.data?.stale && <span className="ml-1 text-amber-600 dark:text-amber-400">(저장본)</span>}
                </span>
              )}
              <Button type="button" variant="outline" size="sm" onClick={refreshAll} disabled={anyFetching}>
                {anyFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                새로고침
              </Button>
            </div>
          </div>
        </header>

        {/* ① 지금 이 측정소 */}
        <AirSection
          id="air-now"
          title={station ? `지금 · ${station}` : '지금'}
          op="getMsrstnAcctoRltmMesureDnsty"
          opLabel="측정소별 실시간 측정정보"
          description="통합대기환경지수와 6개 항목 농도·등급, 24시간 평균, 측정 상태. 아래 띠는 최근 24시간의 시간별 등급입니다."
        >
          {dailyQ.data?.stale && <AirStaleNote fetchedAtLabel={formatRelativeMin(dailyQ.data.fetchedAt)} />}
          {!station && sidoQ.isLoading ? (
            <AirStateBlock kind="loading" />
          ) : !station ? (
            <AirStateBlock kind="empty" message="이 시도에 측정소가 없습니다." />
          ) : dailyQ.isLoading && !dailyQ.data ? (
            <AirStateBlock kind="loading" />
          ) : dailyQ.isError && (!dailyQ.data || dailyQ.isPlaceholderData) ? (
            // 측정소 전환 중 실패 — 이전 측정소의 placeholder 를 계속 보여주면 오정보라 에러로.
            <AirStateBlock
              kind="error"
              message={upstreamMessage(dailyQ.error, '측정소 정보를 불러오지 못했습니다.')}
              onRetry={() => dailyQ.refetch()}
              retrying={dailyQ.isFetching}
            />
          ) : latest ? (
            <div className="flex flex-col gap-5">
              <AirStationHero latest={latest} dim={dailyQ.isPlaceholderData} />
              <AirHourStrip points={dailyQ.data?.points ?? []} todayYmd={todayYmd} dim={dailyQ.isPlaceholderData} />
            </div>
          ) : (
            <AirStateBlock kind="empty" message="이 측정소의 최근 측정값이 없습니다." />
          )}
        </AirSection>

        {/* ②-a 측정소 지도 · 내 주변 · 검색 (측정소정보 API) */}
        <AirSection
          title="측정소 지도 · 내 주변"
          op="getMsrstnList"
          opLabel="측정소정보 API(15073877) · 좌표/주소/측정항목"
          description="전국 측정소 좌표에 현재 통합지수 등급을 색으로 얹은 지도, 측정소명·주소 검색, 내 위치 기준 가까운 측정소. 대기오염정보와 다른 API 라 활용신청이 따로 필요합니다."
        >
          {stationsQ.data?.stale && <AirStaleNote fetchedAtLabel={formatRelativeMin(stationsQ.data.fetchedAt)} />}
          {stationsQ.isLoading && !stationsQ.data ? (
            <AirStateBlock kind="loading" />
          ) : stationsQ.isError && !stationsQ.data ? (
            <AirStationsErrorBlock
              error={stationsQ.error}
              onRetry={() => stationsQ.refetch()}
              retrying={stationsQ.isFetching}
            />
          ) : (
            <AirNearbySection
              stations={stationsQ.data?.items ?? []}
              measures={nationItems ?? []}
              selectedStation={station}
              onSelect={(name, sidoValue) => selectStation(name, sidoValue)}
            />
          )}
        </AirSection>

        {/* ② 추이 */}
        <AirSection
          title="추이"
          op="getMsrstnAcctoRltmMesureDnsty"
          opLabel="dataTerm DAILY · MONTH · 3MONTH"
          description="24시간은 시간별 원본, 30·90일은 일평균. 선 위에 마우스를 올리거나 ←/→ 로 값을 읽을 수 있고, 표로도 볼 수 있습니다."
          aside={
            <>
              <Segmented
                value={term}
                options={AIR_HISTORY_TERMS.map((t) => ({ value: t, label: TERM_LABEL[t] }))}
                onChange={(v) => setParams({ term: v === 'DAILY' ? null : v })}
              />
              <Segmented value={metric} options={AIR_CHART_METRICS.map((m) => ({ value: m.key, label: m.label }))} onChange={setMetric} />
            </>
          }
        >
          {historyQ.data?.stale && <AirStaleNote fetchedAtLabel={formatRelativeMin(historyQ.data.fetchedAt)} />}
          {!station ? (
            <AirStateBlock kind="empty" message="측정소를 선택하면 추이가 표시됩니다." />
          ) : historyQ.isLoading && !historyQ.data ? (
            <AirStateBlock kind="loading" />
          ) : historyQ.isError && (!historyQ.data || historyQ.isPlaceholderData) ? (
            <AirStateBlock
              kind="error"
              message={upstreamMessage(historyQ.error, '시계열을 불러오지 못했습니다.')}
              onRetry={() => historyQ.refetch()}
              retrying={historyQ.isFetching}
            />
          ) : (
            <AirHistoryChart
              points={historyQ.data?.points ?? []}
              unit={historyQ.data?.unit ?? 'hour'}
              metric={metric}
              todayYmd={todayYmd}
              dim={historyQ.isPlaceholderData}
            />
          )}
        </AirSection>

        {/* ③ 시도 측정소 현황 */}
        <AirSection
          title={`${AIR_SIDO_OPTIONS.find((o) => o.value === sido)?.label ?? sido} 측정소 현황`}
          op="getCtprvnRltmMesureDnsty"
          opLabel="시도별 실시간 측정정보"
          description="서버가 '전국' 응답(673개소)을 10분 캐시해 시도로 거릅니다. 행을 누르면 위 상세가 그 측정소로 바뀝니다."
        >
          {sidoQ.data?.stale && <AirStaleNote fetchedAtLabel={formatRelativeMin(sidoQ.data.fetchedAt)} />}
          {sidoQ.isLoading && !sidoQ.data ? (
            <AirStateBlock kind="loading" />
          ) : sidoQ.isError && (!sidoQ.data || sidoQ.isPlaceholderData) ? (
            <AirStateBlock
              kind="error"
              message={upstreamMessage(sidoQ.error, '측정소 현황을 불러오지 못했습니다.')}
              onRetry={() => sidoQ.refetch()}
              retrying={sidoQ.isFetching}
            />
          ) : (
            <AirSidoTable
              items={sidoQ.data?.items ?? []}
              selectedStation={station}
              onSelectStation={(name) => selectStation(name)}
              dim={sidoQ.isPlaceholderData}
            />
          )}
        </AirSection>

        {/* ④ 전국 시도 비교 */}
        <AirSection
          title="전국 시도 비교"
          op="getCtprvnRltmMesureDnsty"
          opLabel="sidoName=전국"
          description="같은 응답을 시도별 평균으로 접은 것. 2026-07 광주·전남 통합 이후 업스트림이 두 지역을 '전남광주' 한 라벨로 줍니다."
        >
          {!nationItems ? (
            (sido === '전국' ? sidoQ : nationQ).isError ? (
              <AirStateBlock kind="error" message={upstreamMessage((sido === '전국' ? sidoQ : nationQ).error, '전국 자료를 불러오지 못했습니다.')} />
            ) : (
              <AirStateBlock kind="loading" />
            )
          ) : (
            <AirSidoCompare
              items={nationItems}
              metric={compareMetric}
              onMetricChange={setCompareMetric}
              selectedSido={sido}
              onSelectSido={selectSido}
            />
          )}
        </AirSection>

        {/* ⑤ 나쁨 이상 측정소 */}
        <AirSection
          title="지금 나쁨 이상인 측정소"
          op="getUnityAirEnvrnIdexSnstiveAboveMsrstnList"
          opLabel="통합대기환경지수 나쁨 이상 측정소 목록"
          description="전국에서 통합대기환경지수가 '나쁨' 이상인 측정소만. 주소 앞머리로 시도를 묶었습니다."
        >
          {badQ.data?.stale && <AirStaleNote fetchedAtLabel={formatRelativeMin(badQ.data.fetchedAt)} />}
          {badQ.isLoading && !badQ.data ? (
            <AirStateBlock kind="loading" />
          ) : badQ.isError && !badQ.data ? (
            <AirStateBlock
              kind="error"
              message={upstreamMessage(badQ.error, '목록을 불러오지 못했습니다.')}
              onRetry={() => badQ.refetch()}
              retrying={badQ.isFetching}
            />
          ) : (
            <AirBadStations
              items={badQ.data?.items ?? []}
              onSelectStation={(name, sidoValue) => selectStation(name, sidoValue)}
            />
          )}
        </AirSection>

        {/* ⑥ 대기질 예보 */}
        <AirSection
          title="대기질 예보"
          op="getMinuDustFrcstDspth"
          opLabel="대기질 예보통보 조회"
          description="발표 시각별 오늘·내일(·모레) 권역 등급, 예보개황·발생원인·행동요령 원문, 예측모델 이미지. 업스트림이 InformCode 필터를 무시하므로 3개 항목을 한 번에 받아 여기서 나눕니다."
          aside={
            <Segmented
              value={code}
              options={AIR_FORECAST_TABS.map((t) => ({ value: t.code, label: t.label }))}
              onChange={(v) => setParams({ code: v === 'PM10' ? null : v })}
            />
          }
        >
          {forecastQ.data?.stale && <AirStaleNote fetchedAtLabel={formatRelativeMin(forecastQ.data.fetchedAt)} />}
          {forecastQ.isLoading && !forecastQ.data ? (
            <AirStateBlock kind="loading" />
          ) : forecastQ.isError && !forecastQ.data ? (
            <AirStateBlock
              kind="error"
              message={upstreamMessage(forecastQ.error, '예보를 불러오지 못했습니다.')}
              onRetry={() => forecastQ.refetch()}
              retrying={forecastQ.isFetching}
            />
          ) : forecastQ.data ? (
            <AirForecastSection data={forecastQ.data} code={code} todayYmd={todayYmd} />
          ) : null}
        </AirSection>

        {/* ⑦ 초미세먼지 주간예보 */}
        <AirSection
          title="초미세먼지 주간예보"
          op="getMinuDustWeekFrcstDspth"
          opLabel="초미세먼지 주간예보 조회"
          description="발표일 기준 3~6일 뒤(D+3~D+6) 권역별 낮음/높음과 대기질 전망, 신뢰도."
        >
          {weeklyQ.data?.stale && <AirStaleNote fetchedAtLabel={formatRelativeMin(weeklyQ.data.fetchedAt)} />}
          {weeklyQ.isLoading && !weeklyQ.data ? (
            <AirStateBlock kind="loading" />
          ) : weeklyQ.isError && !weeklyQ.data ? (
            <AirStateBlock
              kind="error"
              message={upstreamMessage(weeklyQ.error, '주간예보를 불러오지 못했습니다.')}
              onRetry={() => weeklyQ.refetch()}
              retrying={weeklyQ.isFetching}
            />
          ) : weeklyQ.data ? (
            <AirWeeklySection data={weeklyQ.data} />
          ) : null}
        </AirSection>

        {/* ⑧ 기준·출처 */}
        <AirSection title="등급 기준과 출처" op="CAI" opLabel="통합대기환경지수 구간 · 공공누리 출처표시">
          <AirLegend />
        </AirSection>
      </div>
    </div>
  );
};

// 세그먼트 토글 — 홈의 ToggleGroup 과 같은 모양(섹션 헤더 우측 슬롯용, 라벨 없음).
const Segmented = <T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) => (
  <div className="inline-flex flex-wrap rounded-md border bg-card p-0.5">
    {options.map((opt) => {
      const active = opt.value === value;
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={active}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
            active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);
