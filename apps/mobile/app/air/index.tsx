import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AIR_HISTORY_TERMS, type AirForecastCodeType, type AirHistoryTermType, type AirNearbyStationItemType } from '@repo/api-contract';
import {
  ApiError,
  useAirBadStations,
  useAirForecast,
  useAirLocation,
  useAirNearbyStations,
  useAirSidoRealtime,
  useAirStationHistory,
  useAirStations,
  useAirWeeklyForecast,
  SegmentedControl,
  useTheme,
} from '@repo/shared';
import { AIR_SIDO_OPTIONS, airSidoMatches, formatRelativeMin, isInKorea, todayKst } from '@repo/utils';
import { AirBadStationsCard } from '~/components/air/AirBadStationsCard';
import { AirDailyStrip } from '~/components/air/AirDailyStrip';
import { AirStationsMapCard } from '~/components/air/AirStationsMapCard';
import { AirForecastCard } from '~/components/air/AirForecastCard';
import { AirHourStrip } from '~/components/air/AirHourStrip';
import { AirNearbyCard } from '~/components/air/AirNearbyCard';
import { AirNowCard } from '~/components/air/AirNowCard';
import { AirSidoCompareCard } from '~/components/air/AirSidoCompareCard';
import { AirStationBar } from '~/components/air/AirStationBar';
import { AirStationPicker } from '~/components/air/AirStationPicker';
import { AirWeeklyCard } from '~/components/air/AirWeeklyCard';
import { Card, CardTitle, Note, StateBlock } from '~/components/common/Cards';
import { useUserLocationNative } from '~/hooks/useUserLocationNative';

// 대기정보 — 웹 /air 의 앱판. 데이터 훅·등급 규칙은 @repo/shared·@repo/utils 와 공용이고 화면만 세로
// 카드로: 측정소 바 → 지금(CAI 히어로 + 6항목 + 24시간 띠) → 내 주변 측정소 → 예보(오늘/내일/모레) →
// 주간예보 → 나쁨 이상 → 시도 비교. 30·90일 추이는 일평균 등급 막대(View), 측정소 지도는 대중교통과
// 같은 WebView 지도를 카드 높이로 끼운다.
//
// 측정소 해석(웹과 같은 규칙): 파라미터(sido/station) → 저장한 내 위치(날씨·홈 카드와 공유)의 가장
// 가까운 측정소 → 서울 첫 측정소. 선택은 화면 로컬 상태(URL 대신).

const DEFAULT_SIDO = '서울';
const TERM_LABEL: Record<AirHistoryTermType, string> = { DAILY: '24시간', MONTH: '30일', '3MONTH': '90일' };
type DailyMetric = 'pm25' | 'pm10' | 'o3';

type Selection = { kind: 'auto' } | { kind: 'station'; sido: string; station: string };

const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

const upstreamMessage = (e: unknown, fallback: string): string => {
  if (e instanceof ApiError) {
    if (e.statusCode === 503) return `서버에 에어코리아 API 키가 없거나 일일 한도가 찼습니다. (${e.message})`;
    if (e.statusCode === 502) return `에어코리아 API가 응답하지 않습니다. 잠시 후 다시 시도하세요. (${e.message})`;
    if (e.statusCode === 429) return '요청이 너무 잦습니다. 잠시 후 다시 시도하세요.';
  }
  return fallback;
};

const sidoOptionFor = (sidoName: string | null): string | null =>
  AIR_SIDO_OPTIONS.find((o) => o.value !== '전국' && sidoName !== null && airSidoMatches(o.value, sidoName))?.value ?? null;

export default function AirScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ sido?: string; station?: string }>();
  const [sel, setSel] = useState<Selection>(() => {
    const s = first(params.sido);
    const st = first(params.station);
    return st ? { kind: 'station', sido: s && AIR_SIDO_OPTIONS.some((o) => o.value === s) ? s : DEFAULT_SIDO, station: st } : { kind: 'auto' };
  });
  const todayYmd = todayKst();

  // 저장한 내 위치 → 가장 가까운 측정소(auto 일 때 기본 측정소·내 주변 기준점).
  const airLocation = useAirLocation();
  const saved = airLocation.location;
  const savedNearestQ = useAirNearbyStations(sel.kind === 'auto' ? (saved?.lat ?? null) : null, sel.kind === 'auto' ? (saved?.lng ?? null) : null, {
    limit: 1,
    radius: 50_000,
  });
  const savedNearest = sel.kind === 'auto' ? (savedNearestQ.data?.items[0] ?? null) : null;
  const sido = sel.kind === 'station' ? sel.sido : (sidoOptionFor(savedNearest?.sidoName ?? null) ?? DEFAULT_SIDO);

  // ── 조회 ──
  const sidoQ = useAirSidoRealtime(sido);
  const nationQ = useAirSidoRealtime(sido === '전국' ? null : '전국');
  const nationItems = sido === '전국' ? sidoQ.data?.items : nationQ.data?.items;
  const stations = useMemo(() => {
    const names = (sidoQ.data?.items ?? []).map((m) => m.stationName);
    return names.filter((v, i) => names.indexOf(v) === i).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [sidoQ.data]);
  const station =
    sel.kind === 'station' && stations.includes(sel.station)
      ? sel.station
      : savedNearest && stations.includes(savedNearest.stationName)
        ? savedNearest.stationName
        : (stations[0] ?? null);
  const dailyQ = useAirStationHistory(station, 'DAILY');
  // 추이 기간 — 24시간은 위 띠(dailyQ), 30·90일은 일평균 막대(historyQ).
  const [term, setTerm] = useState<AirHistoryTermType>('DAILY');
  const [dailyMetric, setDailyMetric] = useState<DailyMetric>('pm25');
  const historyQ = useAirStationHistory(term === 'DAILY' ? null : station, term);
  const badQ = useAirBadStations();
  const forecastQ = useAirForecast();
  const weeklyQ = useAirWeeklyForecast();
  // 측정소 좌표(별도 API) — '이 측정소를 내 위치로 저장' 에 쓴다(활용신청 전이면 503 → 저장 버튼 비활성).
  const stationsQ = useAirStations();
  const stationCoord = useMemo(() => {
    const s = station ? stationsQ.data?.items.find((it) => it.stationName === station) : undefined;
    return s && s.lat !== null && s.lng !== null ? { lat: s.lat, lng: s.lng } : null;
  }, [stationsQ.data, station]);

  // 내 주변 — 기준점: GPS(버튼) > 저장한 내 위치.
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const center = gps ?? (saved ? { lat: saved.lat, lng: saved.lng } : null);
  const nearbyQ = useAirNearbyStations(center?.lat ?? null, center?.lng ?? null, { limit: 5, radius: 20_000 });
  const centerLabel = gps ? '현재 위치(GPS)' : saved ? `저장한 내 위치(${saved.label ?? '저장 지점'})` : null;
  const userLoc = useUserLocationNative();
  const [locating, setLocating] = useState(false);
  const locate = useCallback(async () => {
    setLocating(true);
    try {
      const r = await userLoc.refetch();
      if (r.status === 'granted' && r.coords) {
        if (!isInKorea(r.coords)) {
          Alert.alert('서비스 지역 밖', '현재 위치가 서비스 지역(한국) 밖이에요.');
          return;
        }
        setGps(r.coords);
        return;
      }
      if (r.status === 'pending' || r.status === 'idle') return;
      Alert.alert(
        '위치 권한 필요',
        r.status === 'denied' ? '위치 권한이 꺼져 있어요. 설정에서 허용한 뒤 다시 시도해 주세요.' : '이 환경에서는 위치를 사용할 수 없어요. 설정을 확인해 주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '설정 열기', onPress: () => Linking.openSettings().catch(() => {}) },
        ],
      );
    } finally {
      setLocating(false);
    }
  }, [userLoc]);

  const [code, setCode] = useState<AirForecastCodeType>('PM10');
  const [compareMetric, setCompareMetric] = useState<'pm25' | 'pm10'>('pm25');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const refreshAll = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['air'] });
    } finally {
      setPullRefreshing(false);
    }
  }, [queryClient]);

  const selectStation = useCallback((name: string, sidoValue: string | null) => {
    setSel({ kind: 'station', sido: sidoValue ?? DEFAULT_SIDO, station: name });
  }, []);
  const selectNearby = useCallback((it: AirNearbyStationItemType) => selectStation(it.stationName, sidoOptionFor(it.sidoName)), [selectStation]);

  // 이 측정소를 내 위치로 저장(station) / 해제 — 날씨·홈 카드와 같은 저장소.
  const savedHere = saved !== null && stationCoord !== null && Math.abs(saved.lat - stationCoord.lat) < 0.0005 && Math.abs(saved.lng - stationCoord.lng) < 0.0005;
  const toggleSave = useCallback(() => {
    if (savedHere) {
      airLocation.clear();
      return;
    }
    if (!stationCoord || !station) return;
    airLocation.save({ lat: stationCoord.lat, lng: stationCoord.lng, label: station, source: 'station' });
  }, [savedHere, airLocation, stationCoord, station]);

  const latest = dailyQ.data?.latest ?? null;
  const fetchedLabel = sidoQ.data?.fetchedAt ? formatRelativeMin(sidoQ.data.fetchedAt) : null;
  const anyFetching = sidoQ.isFetching || dailyQ.isFetching || badQ.isFetching || forecastQ.isFetching || weeklyQ.isFetching;
  const sidoLabel = AIR_SIDO_OPTIONS.find((o) => o.value === sido)?.label ?? sido;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: '대기정보' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.bg }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl refreshing={pullRefreshing} onRefresh={() => void refreshAll()} tintColor={theme.colors.primary} colors={[theme.colors.primary]} progressBackgroundColor={theme.colors.surface} />
        }
      >
        <AirStationBar
          label={station ?? (sidoQ.isLoading ? '측정소 불러오는 중…' : '측정소 없음')}
          sub={`${sidoLabel}${latest?.mangName ? ` · ${latest.mangName}` : ''}${savedNearest && station === savedNearest.stationName ? ' · 저장한 내 위치에서 가장 가까움' : ''}`}
          fetchedLabel={fetchedLabel}
          stale={sidoQ.data?.stale ?? false}
          onOpenPicker={() => setPickerOpen(true)}
          onLocate={() => void locate()}
          locating={locating}
          savedHere={savedHere}
          canSave={stationCoord !== null}
          saving={airLocation.isSaving}
          onToggleSave={toggleSave}
          onRefresh={() => void refreshAll()}
          refreshing={anyFetching}
        />

        {/* ① 지금 */}
        <Card dim={dailyQ.isPlaceholderData}>
          <CardTitle title={station ? `지금 · ${station}` : '지금'} sub="통합대기환경지수와 6개 항목 농도·등급. 아래 띠는 최근 24시간의 시간별 등급." />
          {dailyQ.data?.stale && <Note tone="warn">에어코리아 API 응답이 없어 {formatRelativeMin(dailyQ.data.fetchedAt)} 받아둔 정보를 표시하고 있습니다.</Note>}
          {!station && sidoQ.isLoading ? (
            <StateBlock kind="loading" />
          ) : !station ? (
            <StateBlock kind={sidoQ.isError ? 'error' : 'empty'} message={sidoQ.isError ? upstreamMessage(sidoQ.error, '측정소 현황을 불러오지 못했습니다.') : '이 시도에 측정소가 없습니다.'} onRetry={() => void sidoQ.refetch()} retrying={sidoQ.isFetching} />
          ) : dailyQ.isLoading && !dailyQ.data ? (
            <StateBlock kind="loading" />
          ) : dailyQ.isError && (!dailyQ.data || dailyQ.isPlaceholderData) ? (
            <StateBlock kind="error" message={upstreamMessage(dailyQ.error, '측정소 정보를 불러오지 못했습니다.')} onRetry={() => void dailyQ.refetch()} retrying={dailyQ.isFetching} />
          ) : latest ? (
            <>
              <AirNowCard latest={latest} />
              <SegmentedControl
                fullWidth={false}
                value={term}
                options={AIR_HISTORY_TERMS.map((t) => ({ value: t, label: TERM_LABEL[t] }))}
                onChange={setTerm}
              />
              {term === 'DAILY' ? (
                <AirHourStrip points={dailyQ.data?.points ?? []} todayYmd={todayYmd} />
              ) : historyQ.isLoading && !historyQ.data ? (
                <StateBlock kind="loading" />
              ) : historyQ.isError && !historyQ.data ? (
                <StateBlock kind="error" message={upstreamMessage(historyQ.error, '시계열을 불러오지 못했습니다.')} onRetry={() => void historyQ.refetch()} retrying={historyQ.isFetching} />
              ) : (
                <>
                  <SegmentedControl
                    fullWidth={false}
                    value={dailyMetric}
                    options={[
                      { value: 'pm25', label: 'PM2.5' },
                      { value: 'pm10', label: 'PM10' },
                      { value: 'o3', label: '오존' },
                    ]}
                    onChange={setDailyMetric}
                  />
                  <AirDailyStrip points={historyQ.data?.points ?? []} metric={dailyMetric} />
                </>
              )}
            </>
          ) : (
            <StateBlock kind="empty" message="이 측정소의 최근 측정값이 없습니다." />
          )}
        </Card>

        {/* ②-a 측정소 지도 — 측정소정보 API(활용신청 별도). 503 이면 안내만. */}
        <Card>
          <CardTitle title="측정소 지도" sub="전국 측정소에 현재 통합지수 등급을 색으로 — 마커를 탭하면 그 측정소로" />
          {stationsQ.isLoading && !stationsQ.data ? (
            <StateBlock kind="loading" />
          ) : stationsQ.isError && !stationsQ.data ? (
            <StateBlock
              kind="error"
              message={upstreamMessage(stationsQ.error, '측정소 좌표를 불러오지 못했습니다(측정소정보 API 활용신청이 필요할 수 있어요).')}
              onRetry={() => void stationsQ.refetch()}
              retrying={stationsQ.isFetching}
            />
          ) : (
            <AirStationsMapCard
              stations={stationsQ.data?.items ?? []}
              measures={nationItems ?? []}
              selectedStation={station}
              nearby={nearbyQ.data?.items ?? []}
              myLocation={gps}
              savedLocation={saved ? { lat: saved.lat, lng: saved.lng } : null}
              onSelect={selectStation}
            />
          )}
        </Card>

        {/* ② 내 주변 */}
        <Card>
          <CardTitle title="내 주변 측정소" sub="저장한 내 위치 또는 현재 위치(GPS)에서 가까운 순 · 탭하면 그 측정소로" />
          <AirNearbyCard
            centerLabel={centerLabel}
            items={nearbyQ.data?.items ?? []}
            loading={!!center && nearbyQ.isLoading && !nearbyQ.data}
            errorMessage={nearbyQ.isError && !nearbyQ.data ? upstreamMessage(nearbyQ.error, '주변 측정소를 불러오지 못했습니다.') : null}
            selectedStation={station}
            onSelect={selectNearby}
            onLocate={() => void locate()}
            locating={locating}
          />
        </Card>

        {/* ③ 예보 */}
        <Card>
          <CardTitle title="대기질 예보" sub="발표 시각별 오늘·내일(·모레) 권역 등급과 예보 원문" />
          {forecastQ.data?.stale && <Note tone="warn">에어코리아 API 응답이 없어 {formatRelativeMin(forecastQ.data.fetchedAt)} 받아둔 예보를 표시하고 있습니다.</Note>}
          {forecastQ.isLoading && !forecastQ.data ? (
            <StateBlock kind="loading" />
          ) : forecastQ.isError && !forecastQ.data ? (
            <StateBlock kind="error" message={upstreamMessage(forecastQ.error, '예보를 불러오지 못했습니다.')} onRetry={() => void forecastQ.refetch()} retrying={forecastQ.isFetching} />
          ) : forecastQ.data ? (
            <AirForecastCard data={forecastQ.data} code={code} onCode={setCode} todayYmd={todayYmd} />
          ) : null}
        </Card>

        {/* ④ 주간예보 */}
        <Card>
          <CardTitle title="초미세먼지 주간예보" sub="발표일 기준 3~6일 뒤 권역별 낮음/높음과 대기질 전망" />
          {weeklyQ.data?.stale && <Note tone="warn">에어코리아 API 응답이 없어 {formatRelativeMin(weeklyQ.data.fetchedAt)} 받아둔 주간예보를 표시하고 있습니다.</Note>}
          {weeklyQ.isLoading && !weeklyQ.data ? (
            <StateBlock kind="loading" />
          ) : weeklyQ.isError && !weeklyQ.data ? (
            <StateBlock kind="error" message={upstreamMessage(weeklyQ.error, '주간예보를 불러오지 못했습니다.')} onRetry={() => void weeklyQ.refetch()} retrying={weeklyQ.isFetching} />
          ) : weeklyQ.data ? (
            <AirWeeklyCard data={weeklyQ.data} />
          ) : null}
        </Card>

        {/* ⑤ 나쁨 이상 */}
        <Card>
          <CardTitle title="지금 나쁨 이상인 측정소" sub="전국에서 통합대기환경지수가 '나쁨' 이상인 곳만 · 탭하면 그 측정소로" />
          {badQ.data?.stale && <Note tone="warn">에어코리아 API 응답이 없어 {formatRelativeMin(badQ.data.fetchedAt)} 받아둔 목록을 표시하고 있습니다.</Note>}
          {badQ.isLoading && !badQ.data ? (
            <StateBlock kind="loading" />
          ) : badQ.isError && !badQ.data ? (
            <StateBlock kind="error" message={upstreamMessage(badQ.error, '목록을 불러오지 못했습니다.')} onRetry={() => void badQ.refetch()} retrying={badQ.isFetching} />
          ) : (
            <AirBadStationsCard items={badQ.data?.items ?? []} onSelect={selectStation} />
          )}
        </Card>

        {/* ⑥ 시도 비교 */}
        <Card>
          <CardTitle title="전국 시도 비교" sub="시도별 평균 농도(같은 '전국' 응답을 접은 값)" />
          {!nationItems ? (
            (sido === '전국' ? sidoQ : nationQ).isError ? (
              <StateBlock kind="error" message={upstreamMessage((sido === '전국' ? sidoQ : nationQ).error, '전국 자료를 불러오지 못했습니다.')} />
            ) : (
              <StateBlock kind="loading" />
            )
          ) : (
            <AirSidoCompareCard items={nationItems} metric={compareMetric} onMetric={setCompareMetric} selectedSido={sido} />
          )}
        </Card>

        <Text style={[styles.footer, { color: theme.colors.textMuted }]}>
          출처 한국환경공단 에어코리아 대기오염정보·측정소정보 API(공공누리 제1유형). 등급은 통합대기환경지수(CAI) 구간 — 좋음·보통·나쁨·매우나쁨. 시도별 실시간은 서버가 10분
          캐시합니다.
        </Text>
      </ScrollView>

      <AirStationPicker
        key={pickerOpen ? 'open' : 'closed'}
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        initialSido={sido}
        currentStation={station}
        onSelect={(s, name) => {
          setSel({ kind: 'station', sido: s, station: name });
          setPickerOpen(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  footer: { fontSize: 11, lineHeight: 16, paddingHorizontal: 4 },
});
