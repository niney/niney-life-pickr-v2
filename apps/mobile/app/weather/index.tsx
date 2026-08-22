import { useCallback, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AirLocationItemType } from '@repo/api-contract';
import {
  useAirLocation,
  useTheme,
  useWeatherAws,
  useWeatherForecast,
  useWeatherMid,
  useWeatherMidSea,
  useWeatherNowcast,
  weatherUpstreamMessage,
} from '@repo/shared';
import {
  WEATHER_DEFAULT_PLACE_ID,
  WEATHER_MID_NATION_STN_ID,
  formatDistanceM,
  formatKmaBaseLabel,
  formatKmaTmFcLabel,
  formatRelativeMin,
  isInKorea,
  latLngToKmaGrid,
  nearestWeatherPlace,
  parseLatLngParam,
  todayKst,
  weatherMidRegionForPlace,
  weatherPlaceById,
  weatherPlaceLabel,
  type WeatherPlace,
} from '@repo/utils';
import { WeatherDailyCard } from '~/components/weather/WeatherDailyCard';
import { WeatherHourlyCard } from '~/components/weather/WeatherHourlyCard';
import { WeatherNowCard } from '~/components/weather/WeatherNowCard';
import { WeatherOutlookCard, type OutlookScope } from '~/components/weather/WeatherOutlookCard';
import { WeatherPlaceBar } from '~/components/weather/WeatherPlaceBar';
import { WeatherPlacePicker } from '~/components/weather/WeatherPlacePicker';
import { Card, CardTitle, Note, StateBlock } from '~/components/common/Cards';
import { WeatherSeaCard } from '~/components/weather/WeatherSeaCard';
import { useUserLocationNative } from '~/hooks/useUserLocationNative';

// 날씨 — 웹 /weather 의 앱판. 데이터 훅·지점 해석·발표 시각/문구는 전부 @repo/shared·@repo/utils 와
// 공용이고 화면만 세로 스크롤 카드로 다시 짰다: 지점 바 → 지금(실황 히어로 + 6시간) → 3일 시간별
// (가로 스크롤 칸, SVG 차트 대신) → 열흘(세로 행) → 중기전망(권역/전국) → 해상(접힘). 예보 버전·코드표는
// 앱에선 생략(출처 한 줄).
//
// 지점 해석(웹과 같은 규칙): 파라미터(p=지점 id / ll=위도,경도) → 저장한 내 위치(대기·홈 카드와 공유,
// 로그인 서버라 늦게 올 수 있어 'auto' 는 매 렌더 해석) → 서울. 지점이면 청사 좌표→격자 + 소속 중기
// 구역, 임의 좌표(GPS)면 격자는 정확히, 중기예보·표시명은 가장 가까운 지점 기준(거리 표기).

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

type Selection = { kind: 'auto' } | { kind: 'place'; id: string } | { kind: 'coords'; lat: number; lng: number };

interface ResolvedLocation {
  kind: 'place' | 'coords';
  lat: number;
  lng: number;
  nx: number;
  ny: number;
  place: WeatherPlace;
  distM: number | null;
  fromSaved: boolean;
}

const fromCoords = (lat: number, lng: number, fromSaved: boolean): ResolvedLocation => {
  const nearest = nearestWeatherPlace(lat, lng);
  const place = nearest?.place ?? weatherPlaceById(WEATHER_DEFAULT_PLACE_ID)!;
  const grid = latLngToKmaGrid(lat, lng);
  return { kind: 'coords', lat, lng, nx: grid.nx, ny: grid.ny, place, distM: nearest?.distM ?? null, fromSaved };
};
const fromPlace = (place: WeatherPlace): ResolvedLocation => {
  const grid = latLngToKmaGrid(place.lat, place.lng);
  return { kind: 'place', lat: place.lat, lng: place.lng, nx: grid.nx, ny: grid.ny, place, distM: null, fromSaved: false };
};
const resolve = (sel: Selection, saved: AirLocationItemType | null): ResolvedLocation => {
  if (sel.kind === 'coords') return fromCoords(sel.lat, sel.lng, false);
  if (sel.kind === 'place') {
    const p = weatherPlaceById(sel.id);
    if (p) return fromPlace(p);
  }
  if (saved) return fromCoords(saved.lat, saved.lng, true);
  return fromPlace(weatherPlaceById(WEATHER_DEFAULT_PLACE_ID)!);
};
const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const initialSelection = (params: { p?: string | string[]; ll?: string | string[] }): Selection => {
  const ll = parseLatLngParam(first(params.ll));
  if (ll) return { kind: 'coords', lat: ll.lat, lng: ll.lng };
  const p = first(params.p);
  if (p && weatherPlaceById(p)) return { kind: 'place', id: p };
  return { kind: 'auto' };
};

export default function WeatherScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ p?: string; ll?: string }>();
  const [sel, setSel] = useState<Selection>(() => initialSelection(params));
  const airLocation = useAirLocation();
  const saved = airLocation.location;
  const loc = resolve(sel, saved);
  const todayYmd = todayKst();

  const savedHere = saved !== null && Math.abs(saved.lat - loc.lat) < 0.0005 && Math.abs(saved.lng - loc.lng) < 0.0005;
  const midRegion = weatherMidRegionForPlace(loc.place);
  const landRegId = midRegion?.land.regId ?? null;
  const stnId = midRegion?.stnId ?? null;
  const taPlaceName = weatherPlaceById(loc.place.taRegId)?.name ?? loc.place.name;
  const [seaOverride, setSeaOverride] = useState<string | null>(null);
  const seaRegId = seaOverride ?? DEFAULT_SEA_BY_LAND[landRegId ?? ''] ?? '12A20000';
  const [outlookScope, setOutlookScope] = useState<OutlookScope>('region');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const userLoc = useUserLocationNative();

  // ── 조회 ──
  const nowcastQ = useWeatherNowcast(loc.nx, loc.ny);
  const awsQ = useWeatherAws(loc.lat, loc.lng, { limit: 2, radius: 15_000 });
  const forecastQ = useWeatherForecast(loc.nx, loc.ny);
  const midQ = useWeatherMid(landRegId, loc.place.taRegId, stnId);
  const nationQ = useWeatherMid(outlookScope === 'nation' ? landRegId : null, loc.place.taRegId, WEATHER_MID_NATION_STN_ID);
  const seaQ = useWeatherMidSea(seaRegId);
  const anyFetching = nowcastQ.isFetching || forecastQ.isFetching || midQ.isFetching || seaQ.isFetching;

  const refreshAll = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['weather'] });
    } finally {
      setPullRefreshing(false);
    }
  }, [queryClient]);

  const locate = useCallback(async () => {
    setLocating(true);
    try {
      const r = await userLoc.refetch();
      if (r.status === 'granted' && r.coords) {
        if (!isInKorea(r.coords)) {
          Alert.alert('서비스 지역 밖', '현재 위치가 서비스 지역(한국) 밖이에요.');
          return;
        }
        setSel({ kind: 'coords', lat: r.coords.lat, lng: r.coords.lng });
        return;
      }
      if (r.status === 'pending' || r.status === 'idle') return;
      Alert.alert(
        '위치 권한 필요',
        r.status === 'denied'
          ? '위치 권한이 꺼져 있어요. 설정에서 허용한 뒤 다시 시도해 주세요.'
          : '이 환경에서는 위치를 사용할 수 없어요. 설정을 확인해 주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '설정 열기', onPress: () => Linking.openSettings().catch(() => {}) },
        ],
      );
    } finally {
      setLocating(false);
    }
  }, [userLoc]);

  // 이 지점을 내 위치로 저장/해제 — 대기·홈 카드와 같은 저장소(로그인 서버/게스트 로컬).
  const toggleSave = useCallback(() => {
    if (savedHere) {
      airLocation.clear();
      return;
    }
    airLocation.save({
      lat: loc.lat,
      lng: loc.lng,
      label: loc.place.name,
      source: loc.kind === 'place' ? 'place' : 'geolocation',
    });
  }, [savedHere, airLocation, loc.lat, loc.lng, loc.place.name, loc.kind]);

  const nearestLabel = weatherPlaceLabel(loc.place);
  const placeLabel =
    loc.kind === 'place'
      ? nearestLabel
      : savedHere
        ? `내 위치(${saved?.label ?? nearestLabel})`
        : `내 위치 · ${nearestLabel} 기준${loc.distM !== null ? ` (${formatDistanceM(loc.distM)})` : ''}`;
  const fetchedLabel = nowcastQ.data?.fetchedAt ? formatRelativeMin(nowcastQ.data.fetchedAt) : null;
  const outlookActive = outlookScope === 'nation' ? nationQ : midQ;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: '날씨' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.bg }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={() => void refreshAll()}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surface}
          />
        }
      >
        <WeatherPlaceBar
          label={placeLabel}
          sub={`격자 (${loc.nx},${loc.ny}) · 중기 ${midRegion?.land.label ?? '-'} / ${taPlaceName}`}
          fetchedLabel={fetchedLabel}
          stale={nowcastQ.data?.stale ?? false}
          onOpenPicker={() => setPickerOpen(true)}
          onLocate={() => void locate()}
          locating={locating}
          savedHere={savedHere}
          saving={airLocation.isSaving}
          onToggleSave={toggleSave}
          onRefresh={() => void refreshAll()}
          refreshing={anyFetching}
        />

        {/* ① 지금 */}
        <Card dim={nowcastQ.isPlaceholderData}>
          <CardTitle title="지금" sub="초단기실황(정시 관측) + 초단기예보(앞 6시간). 기상청 API허브 키가 있으면 가까운 AWS 관측소 1분 값도 보강." />
          {nowcastQ.data?.stale && (
            <Note tone="warn">기상청 API 응답이 없어 {formatRelativeMin(nowcastQ.data.fetchedAt)} 받아둔 정보를 표시하고 있습니다.</Note>
          )}
          {nowcastQ.data && !nowcastQ.data.stale && (nowcastQ.data.ncstFallback || nowcastQ.data.ultraFallback) && (
            <Note>
              {nowcastQ.data.ncstFallback ? '초단기실황' : '초단기예보'} 최신 발표분이 아직 없어 직전 발표분(
              {formatKmaBaseLabel(nowcastQ.data.ncstFallback ? nowcastQ.data.ncstBase : nowcastQ.data.ultraBase)})을 표시합니다. 몇 분 뒤 자동 갱신됩니다.
            </Note>
          )}
          {nowcastQ.isLoading && !nowcastQ.data ? (
            <StateBlock kind="loading" />
          ) : nowcastQ.isError && (!nowcastQ.data || nowcastQ.isPlaceholderData) ? (
            <StateBlock
              kind="error"
              message={weatherUpstreamMessage(nowcastQ.error, '실황을 불러오지 못했습니다.')}
              onRetry={() => void nowcastQ.refetch()}
              retrying={nowcastQ.isFetching}
            />
          ) : nowcastQ.data ? (
            <WeatherNowCard data={nowcastQ.data} aws={awsQ.data ?? null} />
          ) : null}
        </Card>

        {/* ② 3일 시간별 */}
        <Card dim={forecastQ.isPlaceholderData}>
          <CardTitle
            title="3일 시간별"
            sub={`단기예보${forecastQ.data?.base ? ` · ${formatKmaBaseLabel(forecastQ.data.base)} 발표` : ''} — 옆으로 넘겨 보세요. 파란 확률은 강수 가능.`}
          />
          {forecastQ.data?.stale && <Note tone="warn">기상청 API 응답이 없어 {formatRelativeMin(forecastQ.data.fetchedAt)} 받아둔 정보를 표시하고 있습니다.</Note>}
          {forecastQ.data && !forecastQ.data.stale && forecastQ.data.fallback && (
            <Note>단기예보 최신 발표분이 아직 없어 직전 발표분({formatKmaBaseLabel(forecastQ.data.base)})을 표시합니다.</Note>
          )}
          {forecastQ.isLoading && !forecastQ.data ? (
            <StateBlock kind="loading" />
          ) : forecastQ.isError && (!forecastQ.data || forecastQ.isPlaceholderData) ? (
            <StateBlock
              kind="error"
              message={weatherUpstreamMessage(forecastQ.error, '단기예보를 불러오지 못했습니다.')}
              onRetry={() => void forecastQ.refetch()}
              retrying={forecastQ.isFetching}
            />
          ) : (
            <WeatherHourlyCard hours={forecastQ.data?.hours ?? []} todayYmd={todayYmd} />
          )}
        </Card>

        {/* ③ 열흘 */}
        <Card dim={forecastQ.isPlaceholderData || midQ.isPlaceholderData}>
          <CardTitle
            title="열흘"
            sub={`오늘~3일은 단기예보를 하루로 접은 값, 그 뒤는 중기예보(${midRegion?.land.label ?? '-'} 날씨 · ${taPlaceName} 기온). 막대는 전체 기간 최저~최고 축 위의 위치.`}
          />
          {midQ.data?.stale && <Note tone="warn">기상청 API 응답이 없어 {formatRelativeMin(midQ.data.fetchedAt)} 받아둔 중기예보를 표시하고 있습니다.</Note>}
          {midQ.data && !midQ.data.stale && midQ.data.fallback && (
            <Note>중기예보 최신 발표분이 아직 없어 직전 발표분({formatKmaTmFcLabel(midQ.data.tmFc)})을 표시합니다.</Note>
          )}
          {forecastQ.isLoading && midQ.isLoading && !forecastQ.data && !midQ.data ? (
            <StateBlock kind="loading" />
          ) : forecastQ.isError && midQ.isError && !forecastQ.data && !midQ.data ? (
            <StateBlock
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
                <Note tone="warn">{weatherUpstreamMessage(midQ.error, '중기예보를 불러오지 못해 단기예보 3일만 표시합니다.')}</Note>
              )}
              <WeatherDailyCard shortDays={forecastQ.data?.days ?? []} mid={midQ.data ?? null} todayYmd={todayYmd} />
            </>
          )}
        </Card>

        {/* ④ 중기전망 */}
        <Card>
          <WeatherOutlookCard
            scope={outlookScope}
            onScope={setOutlookScope}
            regionLabel={midRegion?.land.label ?? '-'}
            tmFcLabel={formatKmaTmFcLabel(outlookActive.data?.tmFc)}
            text={outlookActive.data?.outlook?.text ?? null}
            loading={outlookActive.isLoading && !outlookActive.data}
            errorMessage={outlookActive.isError && !outlookActive.data ? weatherUpstreamMessage(outlookActive.error, '중기전망을 불러오지 못했습니다.') : null}
            onRetry={() => void outlookActive.refetch()}
            retrying={outlookActive.isFetching}
          />
        </Card>

        {/* ⑤ 해상(접힘) */}
        <Card dim={seaQ.isPlaceholderData}>
          <WeatherSeaCard
            regId={seaRegId}
            onChangeRegion={setSeaOverride}
            data={seaQ.data ?? null}
            todayYmd={todayYmd}
            loading={seaQ.isLoading && !seaQ.data}
            errorMessage={seaQ.isError && (!seaQ.data || seaQ.isPlaceholderData) ? weatherUpstreamMessage(seaQ.error, '해상예보를 불러오지 못했습니다.') : null}
            onRetry={() => void seaQ.refetch()}
            retrying={seaQ.isFetching}
          />
        </Card>

        <Text style={[styles.footer, { color: theme.colors.textMuted }]}>
          출처 기상청 단기예보·중기예보 API(공공누리 제1유형). 실황 매시 10분, 초단기예보 45분, 단기예보 3시간마다, 중기예보 06·18시 발표 — 서버가 발표 시각 단위로
          캐시합니다.
        </Text>
      </ScrollView>

      <WeatherPlacePicker
        // 열 때마다 새로 — 내부 시도 칩 상태가 현재 지점에서 시작하게.
        key={pickerOpen ? 'open' : 'closed'}
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currentPlaceId={loc.kind === 'place' ? loc.place.id : null}
        initialSido={loc.place.sido}
        savedLabel={saved ? (saved.label ?? '저장 지점') : null}
        onSelectPlace={(p) => {
          setSel({ kind: 'place', id: p.id });
          setPickerOpen(false);
        }}
        onSelectMyLocation={() => {
          setPickerOpen(false);
          void locate();
        }}
        onSelectSaved={() => {
          if (saved) setSel({ kind: 'coords', lat: saved.lat, lng: saved.lng });
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
