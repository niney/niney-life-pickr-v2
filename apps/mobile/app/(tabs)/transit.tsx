import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Keyboard,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import BottomSheet, {
  BottomSheetFlatList,
  type BottomSheetBackgroundProps,
} from '@gorhom/bottom-sheet';
import {
  ApiError,
  useBusFavorites,
  useBusNearbyStations,
  useBusPositions,
  useBusRouteDetail,
  useBusStationArrivals,
  useBusStationSearch,
  useBusStationsRefresh,
  useSubwayCongestion,
  useSubwayFavorites,
  useSubwayLineDetail,
  useSubwayLinePositions,
  useSubwayNearbyStations,
  useSubwayPath,
  useSubwayStationArrivals,
  useSubwayStationSearch,
  useSubwayTimetable,
  useTheme,
} from '@repo/shared';
import {
  buildBusStopMarkerDataUrl,
  buildSubwayStationMarkerDataUrl,
  busRouteTypeColor,
  dayTypeForToday,
  formatRelativeMin,
  isInKorea,
  parseBusArrivalSec,
  remainSecSince,
  roundCoord,
  subwayDestinationLabel,
  subwayLineName,
  type SubwayDayType,
} from '@repo/utils';
import type { BusStationItemType, SubwayStationGroupItemType } from '@repo/api-contract';
import type { BridgeMarker } from '~/components/transit/transitMapBridge';
import {
  BusCrossSection,
  SubwayCrossSection,
} from '~/components/transit/CrossSearchSection';
import { FavoriteStar } from '~/components/transit/FavoriteStar';
import { NearestTransitSection } from '~/components/transit/NearestTransitSection';
import { TransitCrossToggleChip } from '~/components/transit/TransitCrossToggleChip';
import { TransitRecentSection } from '~/components/transit/TransitRecentSection';
import {
  TransitFavoritesSection,
  type TransitFavTarget,
} from '~/components/transit/TransitFavoritesSection';
import { SubwayNearbyBusSection } from '~/components/subway/SubwayNearbyBusSection';
import { useTransitCrossShowStore } from '~/lib/transitCrossShowStore';
import {
  matchesTransitRecent,
  useTransitRecentStore,
  type TransitRecentQuery,
  type TransitRecentTarget,
} from '~/lib/transitRecentStore';
import { TransitFloatingHeader } from '~/components/transit/TransitFloatingHeader';
import { TransitMapView } from '~/components/transit/TransitMapView';
import type { TransitMapHandle } from '~/components/transit/useTransitMapSync';
import { useBusMapModel, isBusVehicleId } from '~/components/transit/useBusMapModel';
import { useSubwayMapModel, isSubwayVehicleId } from '~/components/transit/useSubwayMapModel';
import { usePinnedVehicle } from '~/components/transit/usePinnedVehicle';
import { useAlightEta } from '~/components/transit/useAlightEta';
import { useAlightAlert } from '~/components/transit/useAlightAlert';
import { buildRideView } from '~/components/transit/rideView';
import { RideDetailPanel } from '~/components/transit/RideDetailPanel';
import { BusArrivalPanel } from '~/components/bus/BusArrivalPanel';
import {
  BusStationRow,
  type BusStationRowData,
} from '~/components/bus/BusStationListRows';
import { SubwayArrivalPanel } from '~/components/subway/SubwayArrivalPanel';
import { SubwayLineBadge } from '~/components/subway/SubwayLineBadge';
import { SubwayPathPanel } from '~/components/subway/SubwayPathPanel';
import { SubwayTimetable } from '~/components/subway/SubwayTimetable';
import {
  SubwayStationRow,
  type SubwayStationRowData,
} from '~/components/subway/SubwayStationListRows';
import { useTabBarHeight } from '~/hooks/useTabBarHeight';
import {
  useTransitScreen,
  type AlightTarget,
  type TransitMode,
} from '~/hooks/useTransitScreen';
import { useUserLocationNative } from '~/hooks/useUserLocationNative';

// 권한 거부/한국 밖 폴백 — 서울시청(restaurants 탭과 동일).
const SEOUL = { lat: 37.5665, lng: 126.978 };
const SNAP_POINTS = ['20%', '50%', '100%'];
const FALLBACK_HEADER_H = 150;

// 따라가기/탑승 칩 슬롯 — 시트 상단(animatedPosition)에 앵커. 시트가 미측정/
// 언마운트면 이 센티넬이 앵커를 화면 밖으로 밀어 칩이 안 보이게 한다.
const SHEET_TOP_UNSET = 10_000;
const FOLLOW_CHIP_GAP = 10;
const FOLLOW_CHIP_FALLBACK_H = 34;

// 빈 결과 안정 참조 — 매 렌더 새 [] 는 지도 fit 재발화의 원인(웹과 동일 함정).
const EMPTY_GROUPS: SubwayStationGroupItemType[] = [];
const EMPTY_BUS_ITEMS: BusStationItemType[] = [];
const EMPTY_OVERLAY: BridgeMarker[] = [];

// 겸표시 마커 아이콘 — 상대 도메인의 기존 마커 빌더 재사용(선택 개념 없음).
const BUS_OVERLAY_URL = buildBusStopMarkerDataUrl(false);
const SUBWAY_OVERLAY_URL = buildSubwayStationMarkerDataUrl({ selected: false, transfer: false });
const SUBWAY_OVERLAY_TRANSFER_URL = buildSubwayStationMarkerDataUrl({
  selected: false,
  transfer: true,
});


type ListRow =
  | { kind: 'subway-station'; item: SubwayStationRowData }
  | { kind: 'bus-station'; item: BusStationRowData };

const rowKey = (row: ListRow): string =>
  row.kind === 'subway-station' ? `s:${row.item.id}` : `b:${row.item.stId}`;

// 대중교통 탭 — 버스/지하철 통합 화면(웹 BusPage/SubwayPage 포팅).
// restaurants.tsx 골격: 풀스크린 지도(WebView 상시 마운트) + 플로팅 헤더(세그먼트
// +검색) + List/Detail 바텀시트 2개 적층. 버스↔지하철 전환은 재마운트 없이
// 지도 데이터 교체(브리지)로만.
export default function TransitScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarH = useTabBarHeight();
  // 다른 탭에 있을 때 폴링(도착 30s 등)이 돌지 않게 훅 인자를 null 게이트.
  const focused = useIsFocused();
  // 앱 백그라운드 — 폴링은 focusManager(queryFocus.ts)가 끊고, WebView 내부
  // rAF(차량 tween)는 setActive(false)로 명시 정지한다(Android 는 자동 서스펜드
  // 보장이 없음). iOS WKWebView 는 자동이지만 명시 정지가 무해.
  const [appActive, setAppActive] = useState(true);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  // ── 위치 권한 선해석 — WebView(지도) mount 전에 확정(restaurants 선례) ──
  const userLoc = useUserLocationNative();
  const refetchUserLocation = userLoc.refetch;
  const triggeredRef = useRef(false);
  useEffect(() => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    refetchUserLocation();
  }, [refetchUserLocation]);

  const resolved =
    userLoc.status === 'granted' ||
    userLoc.status === 'denied' ||
    userLoc.status === 'unavailable';

  const usableUserCoords =
    userLoc.status === 'granted' && userLoc.coords && isInKorea(userLoc.coords)
      ? userLoc.coords
      : null;
  const initialCenter = usableUserCoords ?? SEOUL;
  // 통합 빠른 선택은 사용자 명시 액션 뒤에만 좌표를 세팅해 양쪽 nearby 조회를
  // 발화한다. null 이면 네트워크 0·섹션 미표시.
  const [quickNear, setQuickNear] = useState<{ lat: number; lng: number } | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (searchBlurTimerRef.current) clearTimeout(searchBlurTimerRef.current);
    },
    [],
  );

  // ── 화면 상태 — 웹 URL 계약을 이식한 단일 reducer ──────────────────────────
  const [state, dispatch] = useTransitScreen();
  const { mode, subway, bus, pinned, alight, alightAlert } = state;
  const stn = subway.stn;
  const stId = bus.stId;

  // 최근 검색/선택은 로그인과 무관한 기기 로컬 기록. 현재 모드 기록만 검색창
  // 자동완성에 노출하고, 입력 중이면 이름/정류소번호/호선명 부분일치로 좁힌다.
  const recentQueries = useTransitRecentStore((s) => s.queries);
  const recentTargets = useTransitRecentStore((s) => s.targets);
  const addRecentQuery = useTransitRecentStore((s) => s.addQuery);
  const addRecentBusTarget = useTransitRecentStore((s) => s.addBusTarget);
  const addRecentSubwayTarget = useTransitRecentStore((s) => s.addSubwayTarget);
  const removeRecentQuery = useTransitRecentStore((s) => s.removeQuery);
  const removeRecentTarget = useTransitRecentStore((s) => s.removeTarget);
  const clearRecentMode = useTransitRecentStore((s) => s.clearMode);
  const recentFiltering = searchDraft.trim().length > 0;
  const visibleRecentQueries = useMemo(
    () =>
      recentQueries
        .filter(
          (item) => item.mode === mode && matchesTransitRecent(item.q, searchDraft),
        )
        .slice(0, 5),
    [recentQueries, mode, searchDraft],
  );
  const visibleRecentTargets = useMemo(
    () =>
      recentTargets
        .filter((item) => {
          if (item.kind !== mode) return false;
          if (matchesTransitRecent(item.name, searchDraft)) return true;
          if (item.kind === 'bus') return matchesTransitRecent(item.arsId, searchDraft);
          return item.lines.some((line) => matchesTransitRecent(line.lineName, searchDraft));
        })
        .slice(0, 5),
    [recentTargets, mode, searchDraft],
  );
  const showRecent =
    searchFocused &&
    quickNear === null &&
    (visibleRecentQueries.length > 0 || visibleRecentTargets.length > 0);

  // 즐겨찾기 — 게스트/로그인 하이브리드. 로그인 직후 게스트 저장분 서버 병합
  // 부수효과가 있어 **화면당 각 1회만** 호출(섹션/패널엔 props 전달).
  const busFavorites = useBusFavorites();
  const subwayFavorites = useSubwayFavorites();
  const hasFavorites =
    busFavorites.stations.length > 0 ||
    busFavorites.routes.length > 0 ||
    subwayFavorites.stations.length > 0 ||
    subwayFavorites.lines.length > 0;

  // ═══════════════════════ 지하철 데이터 ═══════════════════════
  const subwaySearch = useSubwayStationSearch(subway.qInput);
  const subwayTrimmedQ = subway.qInput.trim();
  const subwayHasQ = subwayTrimmedQ.length >= 1 && subwayTrimmedQ.length <= 50;
  const subwayItems = subwayHasQ ? (subwaySearch.data?.items ?? EMPTY_GROUPS) : EMPTY_GROUPS;
  const subwaySearching =
    subwaySearch.isLoading || (subwaySearch.isFetching && subwaySearch.isPlaceholderData);

  const subwayNearMode = subway.near !== null;
  const subwayEffectiveNear = subwayNearMode ? (subway.autoNear ?? subway.near) : null;
  const subwayNearby = useSubwayNearbyStations(
    subwayEffectiveNear?.lat ?? null,
    subwayEffectiveNear?.lng ?? null,
  );
  const subwayNearItems = subwayNearMode
    ? (subwayNearby.data?.items ?? EMPTY_GROUPS)
    : EMPTY_GROUPS;
  const subwayNearSearching =
    subwayNearby.isLoading || (subwayNearby.isFetching && subwayNearby.isPlaceholderData);

  const subwayActive = {
    items: subwayNearMode ? subwayNearItems : subwayItems,
    total: subwayNearMode
      ? (subwayNearby.data?.total ?? 0)
      : subwayHasQ
        ? (subwaySearch.data?.total ?? 0)
        : 0,
    fetchedAt: subwayNearMode
      ? (subwayNearby.data?.fetchedAt ?? null)
      : subwayHasQ
        ? (subwaySearch.data?.fetchedAt ?? null)
        : null,
    loading: subwayNearMode ? subwayNearSearching : subwaySearching,
    error: subwayNearMode ? subwayNearby.isError : subwaySearch.isError,
    success: subwayNearMode ? subwayNearby.isSuccess : subwaySearch.isSuccess,
    placeholder: subwayNearMode
      ? subwayNearby.isPlaceholderData
      : subwaySearch.isPlaceholderData,
  };
  const subwayTruncated =
    (subwayNearMode || subwayHasQ) && subwayActive.items.length < subwayActive.total;

  const subwaySelectedMissing =
    stn !== null &&
    (subwayNearMode || subwayHasQ) &&
    subwayActive.success &&
    !subwayActive.placeholder &&
    !subwayActive.items.some((it) => it.id === stn);

  // 추적 호선 상세(형상+경유역, 지선 sections) — 정적(24h 캐시).
  const subwayLineDetail = useSubwayLineDetail(subway.line);
  // 실시간 열차 위치 — 30초 폴링(지하철 모드 + focus + 노선 추적 시에만).
  const subwayPositions = useSubwayLinePositions(
    mode === 'subway' && focused ? subway.line : null,
  );
  const subwayTrainItems = subway.line ? subwayPositions.data?.items : undefined;

  // 추적 호선의 경유역 집합(id+역명) — 역 전환 시 line 유지 판정(웹 ref 패턴).
  const lineStationKeyRef = useRef<{ ids: Set<string>; names: Set<string> }>({
    ids: new Set(),
    names: new Set(),
  });
  lineStationKeyRef.current = useMemo(() => {
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const sec of subwayLineDetail.data?.sections ?? []) {
      for (const st of sec.stations) {
        ids.add(st.stationId);
        names.add(st.name);
      }
    }
    return { ids, names };
  }, [subwayLineDetail.data]);

  // 경유역 점 클릭 시 그룹 대표 id 재해석용 — 각 호선 stationId → 그룹 id.
  const groupIdByLineStationRef = useRef<Map<string, string>>(new Map());
  groupIdByLineStationRef.current = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of subwayActive.items) for (const l of g.lines) m.set(l.stationId, g.id);
    return m;
  }, [subwayActive.items]);

  // 역×호선 즐겨찾기용 좌표 — 활성 결과 그룹 우선, 없으면 즐겨찾기 스냅샷 복원.
  // 셋 다 없으면 null(딥링크 직진입 등) → 패널이 호선 별을 숨긴다.
  const favStationHit = stn
    ? subwayFavorites.stations.find((s) => s.stationId === stn)
    : undefined;
  const favLineHit = stn
    ? subwayFavorites.lines.find((l) => l.stationId === stn)
    : undefined;
  const recentSubwayMatch = stn
    ? recentTargets.find((item) => item.kind === 'subway' && item.stationId === stn)
    : undefined;
  const recentSubwayHit =
    recentSubwayMatch?.kind === 'subway' ? recentSubwayMatch : undefined;

  // 즐겨찾기 진입 등으로 stn 이 활성 결과에 없을 때 — 스냅샷으로 가상 그룹을
  // 조립해 지도에만 합류(마커/flyTo 가 그대로 동작). 리스트엔 넣지 않는다.
  const favoriteMapGroup = useMemo<SubwayStationGroupItemType | null>(() => {
    if (!stn) return null;
    if (favStationHit) {
      return {
        id: stn,
        name: favStationHit.name,
        lat: favStationHit.lat,
        lng: favStationHit.lng,
        lines: favStationHit.lines.map((lineId) => ({
          stationId: stn,
          lineId,
          lineName: subwayLineName(lineId),
          lat: favStationHit.lat,
          lng: favStationHit.lng,
        })),
      };
    }
    if (favLineHit) {
      return {
        id: stn,
        name: favLineHit.stationName,
        lat: favLineHit.lat,
        lng: favLineHit.lng,
        lines: [
          {
            stationId: stn,
            lineId: favLineHit.lineId,
            lineName: subwayLineName(favLineHit.lineId),
            lat: favLineHit.lat,
            lng: favLineHit.lng,
          },
        ],
      };
    }
    if (recentSubwayHit) {
      return {
        id: recentSubwayHit.stationId,
        name: recentSubwayHit.name,
        lat: recentSubwayHit.lat,
        lng: recentSubwayHit.lng,
        lines: recentSubwayHit.lines,
      };
    }
    return null;
  }, [stn, favStationHit, favLineHit, recentSubwayHit]);

  // 지도 전용 그룹 — 활성 결과 + (활성에 없을 때만) 즐겨찾기 가상 그룹.
  const subwayMapGroups = useMemo(() => {
    if (!favoriteMapGroup) return subwayActive.items;
    if (subwayActive.items.some((g) => g.id === favoriteMapGroup.id)) {
      return subwayActive.items;
    }
    return [...subwayActive.items, favoriteMapGroup];
  }, [subwayActive.items, favoriteMapGroup]);

  // 선택 역 도착정보 — 30초 폴링(지하철 모드 + 화면 focus 일 때만).
  const subwayArrivals = useSubwayStationArrivals(
    mode === 'subway' && focused ? stn : null,
  );
  const arrivalsForStn =
    subwayArrivals.data && stn !== null && subwayArrivals.data.stationId === stn
      ? subwayArrivals.data
      : null;
  const selectedGroup = stn ? subwayActive.items.find((it) => it.id === stn) : undefined;
  const panelStationName =
    arrivalsForStn?.name ??
    selectedGroup?.name ??
    (stn ? stn.slice(stn.indexOf(':') + 1) : '');
  const panelLines =
    arrivalsForStn?.lines ?? selectedGroup?.lines.map((l) => l.lineId) ?? [];
  const subwayArrivalItems = arrivalsForStn?.items ?? [];
  const subwayArrivalLoading =
    subwayArrivals.isLoading || (subwayArrivals.isFetching && arrivalsForStn === null);
  // ── 길찾기 — stn 출발 + to 도착(로컬 다익스트라, 24h 캐시). ─────────────────
  const inPathView = stn !== null && (subway.pathViewOpen || subway.to !== null);
  const subwayPath = useSubwayPath(inPathView ? stn : null, subway.to);
  const pathData = inPathView ? (subwayPath.data ?? null) : null;
  const pathForMap = pathData?.found ? pathData : null;
  const toName =
    pathData?.to.name ?? (subway.to ? subway.to.slice(subway.to.indexOf(':') + 1) : '');

  // ── 시간표/혼잡도 — 뷰 닫힘=선택 stn(오늘) 도착 패널 푸터, 뷰 열림=그 호선
  //    stationId(토글 dayType) 시간표 뷰. 24h 캐시라 전환 비용 낮음(웹 동일). ──
  const todayDayType = useMemo(() => dayTypeForToday(), []);
  const [timetableDayType, setTimetableDayType] = useState<SubwayDayType>(todayDayType);
  const timetableView = subway.timetableView;
  const timetableStationId = timetableView ? timetableView.stationId : stn;
  const timetableQueryDayType = timetableView ? timetableDayType : todayDayType;
  const timetable = useSubwayTimetable(timetableStationId, timetableQueryDayType);
  const congestion = useSubwayCongestion(timetableStationId, timetableQueryDayType);

  // 응답 stationId 게이팅 — 전환 중 이전 데이터가 새지 않게(웹 동일).
  const footerTimetable =
    !timetableView && timetable.data?.stationId === stn ? timetable.data : null;
  const timetableForView =
    timetableView && timetable.data?.stationId === timetableView.stationId
      ? timetable.data
      : null;
  const footerCongestion =
    !timetableView && congestion.data?.stationId === stn ? congestion.data : null;
  const viewCongestion =
    timetableView && congestion.data?.stationId === timetableView.stationId
      ? congestion.data
      : null;

  // 역×호선 즐겨찾기 스냅샷용 좌표 — 활성 그룹 → 즐겨찾기 스냅샷 순 폴백.
  const selectedCoord = selectedGroup
    ? { lat: selectedGroup.lat, lng: selectedGroup.lng }
    : favStationHit
      ? { lat: favStationHit.lat, lng: favStationHit.lng }
      : favLineHit
        ? { lat: favLineHit.lat, lng: favLineHit.lng }
        : null;
  const subwayArrivalNotFound =
    subwayArrivals.isError &&
    subwayArrivals.error instanceof ApiError &&
    subwayArrivals.error.statusCode === 404;

  // ═══════════════════════ 버스 데이터 ═══════════════════════
  const busSearch = useBusStationSearch(bus.q);
  const busRefresh = useBusStationsRefresh();
  const busTrimmedQ = bus.q.trim();
  const busHasQ = busTrimmedQ.length >= 2 && busTrimmedQ.length <= 50;
  const busItems = busHasQ ? (busSearch.data?.items ?? EMPTY_BUS_ITEMS) : EMPTY_BUS_ITEMS;
  const busStale = busHasQ && busSearch.data?.source === 'stale';
  const busSearching =
    busSearch.isLoading || (busSearch.isFetching && busSearch.isPlaceholderData);

  // 주변 정류장 — near(명시) 또는 autoNear(지도 자동) 좌표로 조회.
  const busNearMode = bus.near !== null;
  const busEffectiveNear = busNearMode ? (bus.autoNear ?? bus.near) : null;
  const busNearby = useBusNearbyStations(
    busEffectiveNear?.lat ?? null,
    busEffectiveNear?.lng ?? null,
  );
  const busNearItems = busNearMode ? (busNearby.data?.items ?? EMPTY_BUS_ITEMS) : EMPTY_BUS_ITEMS;
  const busNearSearching =
    busNearby.isLoading || (busNearby.isFetching && busNearby.isPlaceholderData);

  const busActive = {
    items: busNearMode ? busNearItems : busItems,
    total: busNearMode ? (busNearby.data?.total ?? 0) : busHasQ ? (busSearch.data?.total ?? 0) : 0,
    fetchedAt: busNearMode
      ? (busNearby.data?.fetchedAt ?? null)
      : busHasQ
        ? (busSearch.data?.fetchedAt ?? null)
        : null,
    loading: busNearMode ? busNearSearching : busSearching,
    error: busNearMode ? busNearby.isError : busSearch.isError,
    success: busNearMode ? busNearby.isSuccess : busSearch.isSuccess,
    placeholder: busNearMode ? busNearby.isPlaceholderData : busSearch.isPlaceholderData,
  };
  const busTruncated =
    (busNearMode || busHasQ) && busActive.items.length < busActive.total;

  // 지도 마커 누적 — 주변 모드에서 자동 재조회로 결과가 교체될 때 이전 지점
  // 마커까지 사라지지 않게 이번 주변 세션의 합집합을 유지(리스트는 현재 지점
  // 결과만). 명시 near 변경 시 리셋, 상한 600(웹 BusPage accumRef 이식).
  const busAccumRef = useRef(new Map<string, BusStationItemType>());
  const prevBusNearRef = useRef(bus.near);
  const busMapItems = useMemo(() => {
    if (!busNearMode) {
      busAccumRef.current = new Map();
      return busItems;
    }
    if (prevBusNearRef.current !== bus.near) {
      prevBusNearRef.current = bus.near;
      busAccumRef.current = new Map();
    }
    const acc = busAccumRef.current;
    for (const it of busNearItems) acc.set(it.stId, it);
    if (acc.size > 600) {
      busAccumRef.current = new Map(busNearItems.map((it) => [it.stId, it]));
    }
    return [...busAccumRef.current.values()];
  }, [busNearMode, bus.near, busNearItems, busItems]);

  // 노선 보기(추적) — 형상+경유 정류소+기본정보(24h 캐시, 폴링 없음).
  const busRouteDetail = useBusRouteDetail(bus.routeId);
  const busRouteInfo = bus.routeId ? (busRouteDetail.data?.info ?? null) : null;
  const busRouteColor = busRouteDetail.data
    ? busRouteTypeColor(busRouteDetail.data.info.routeType)
    : '#6b7280';
  // 폴리라인 — 참조 안정화(memo)로 1,986점을 매 렌더 재생성하지 않는다.
  const busRouteLine = useMemo(() => {
    if (!bus.routeId || !busRouteDetail.data || busRouteDetail.data.path.length < 2) {
      return null;
    }
    return { points: busRouteDetail.data.path, color: busRouteColor };
  }, [bus.routeId, busRouteDetail.data, busRouteColor]);
  const busRouteStops = bus.routeId ? busRouteDetail.data?.stations : undefined;
  // 정류장 선택이 '노선 위 이동'인지 — 클릭 시점 판정용 ref(웹 routeStationIdsRef).
  const busRouteStationIdsRef = useRef<Set<string>>(new Set());
  busRouteStationIdsRef.current = useMemo(
    () => new Set((busRouteDetail.data?.stations ?? []).map((s) => s.stId)),
    [busRouteDetail.data],
  );

  // 노선 전체 실시간 차량 — 15초 폴링(버스 모드 + focus + 노선 추적 시에만).
  const busPositions = useBusPositions(
    mode === 'bus' && focused ? bus.routeId : null,
  );
  const busVehicles = bus.routeId ? (busPositions.data?.items ?? undefined) : undefined;

  // 선택 정류장 실체 — 지도 누적 결과 → 즐겨찾기 스냅샷(정류장/노선) → 노선
  // 경유지 스냅샷 폴백(웹 BusPage 체인).
  const selectedBusStation = useMemo<BusStationItemType | null>(() => {
    if (stId === null) return null;
    const fromActive = busMapItems.find((it) => it.stId === stId);
    if (fromActive) return fromActive;
    const favStation = busFavorites.stations.find((s) => s.stId === stId);
    if (favStation) return favStation;
    const favRoute = busFavorites.routes.find((r) => r.stId === stId);
    if (favRoute) {
      return {
        stId: favRoute.stId,
        arsId: favRoute.arsId,
        name: favRoute.stationName,
        lat: favRoute.lat,
        lng: favRoute.lng,
      };
    }
    const recentMatch = recentTargets.find(
      (item) => item.kind === 'bus' && item.stId === stId,
    );
    const recentStation = recentMatch?.kind === 'bus' ? recentMatch : undefined;
    if (recentStation) return recentStation;
    // 노선 경유지 점 클릭으로 목록에 없는 정류장 선택 시 도착 패널이 살아야 한다.
    const routeStation = busRouteDetail.data?.stations.find((s) => s.stId === stId);
    if (routeStation) {
      return {
        stId: routeStation.stId,
        arsId: routeStation.arsId,
        name: routeStation.name,
        lat: routeStation.lat,
        lng: routeStation.lng,
      };
    }
    return null;
  }, [
    stId,
    busMapItems,
    busFavorites.stations,
    busFavorites.routes,
    recentTargets,
    busRouteDetail.data,
  ]);

  // 어떤 진입 경로(검색·지도·근처·즐겨찾기·크로스)든 상세가 실제로 성립한
  // 시점에 한 번만 최근 선택으로 기록한다. 뒤로 나갔다 같은 곳을 다시 열면
  // ref가 리셋돼 최신 시각으로 위에 올라온다.
  const selectedSubwayForRecent = stn
    ? subwayMapGroups.find((group) => group.id === stn) ?? null
    : null;
  const lastRecordedTargetRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = mode === 'bus' ? stId : stn;
    if (!currentId) {
      lastRecordedTargetRef.current = null;
      return;
    }
    const key = `${mode}:${currentId}`;
    if (lastRecordedTargetRef.current === key) return;

    if (mode === 'bus') {
      if (!selectedBusStation) return;
      addRecentBusTarget(selectedBusStation);
      if (bus.q.trim().length >= 2) addRecentQuery('bus', bus.q);
    } else {
      if (!selectedSubwayForRecent) return;
      addRecentSubwayTarget(selectedSubwayForRecent);
      if (subway.qInput.trim().length >= 1) addRecentQuery('subway', subway.qInput);
    }
    lastRecordedTargetRef.current = key;
  }, [
    mode,
    stId,
    stn,
    selectedBusStation,
    selectedSubwayForRecent,
    bus.q,
    subway.qInput,
    addRecentBusTarget,
    addRecentSubwayTarget,
    addRecentQuery,
  ]);

  // 지도용 정류장 — 선택 정류장이 활성 결과에 없으면(즐겨찾기 진입) 덧대어
  // 마커/flyTo 가 동작하게 한다(웹 mapItemsForMap).
  const busMapItemsForMap = useMemo(() => {
    if (!selectedBusStation) return busMapItems;
    if (busMapItems.some((it) => it.stId === selectedBusStation.stId)) return busMapItems;
    return [...busMapItems, selectedBusStation];
  }, [busMapItems, selectedBusStation]);

  const busSelectedMissing =
    stId !== null &&
    (busNearMode || busHasQ) &&
    busActive.success &&
    !busActive.placeholder &&
    selectedBusStation === null;

  // 도착정보 30초 폴링 — 가상정류장(arsId '0')은 훅 enabled 가 차단.
  const busArrivals = useBusStationArrivals(
    mode === 'bus' && focused ? (selectedBusStation?.arsId ?? null) : null,
  );
  const busArrivalItems = busArrivals.data?.items ?? [];

  // 통합 '근처' 빠른 선택 — 버스 500m / 지하철 1.5km 기존 기본 반경과 캐시를
  // 그대로 재사용한다. 사용자가 버튼을 누르기 전에는 둘 다 disabled.
  const quickBusNearby = useBusNearbyStations(
    quickNear?.lat ?? null,
    quickNear?.lng ?? null,
  );
  const quickSubwayNearby = useSubwayNearbyStations(
    quickNear?.lat ?? null,
    quickNear?.lng ?? null,
  );

  // 차량 알약 라벨 — 도착정보 routeName 우선, 없으면 노선 상세 폴백.
  const selectedBusArrival = bus.routeId
    ? (busArrivalItems.find((it) => it.busRouteId === bus.routeId) ?? null)
    : null;
  const busVehicleLabel = selectedBusArrival?.routeName ?? busRouteInfo?.routeName ?? null;

  // ── 통합 겸표시 — 주변 모드에 상대 도메인 마커를 함께(웹 14차). 조회는 토글
  //    노출 조건이면 항상(지하철 nearby 는 쿼터 0, 버스는 셀 캐시), 표시만
  //    show 게이트. 집중 모드(노선/경로)에선 조회·표시 모두 없음. ─────────────
  const crossShow = useTransitCrossShowStore((s) => s.show);
  const subwayCrossVisible =
    subwayNearMode && subway.line === null && !(subway.pathViewOpen || subway.to !== null);
  const busCrossVisible = busNearMode && bus.routeId === null;
  const crossToggleVisible = mode === 'subway' ? subwayCrossVisible : busCrossVisible;
  const crossNear = crossToggleVisible
    ? mode === 'subway'
      ? subwayEffectiveNear
      : busEffectiveNear
    : null;
  // 지하철 모드 → 버스 정류장 겸표시 / 버스 모드 → 지하철역 겸표시.
  const crossBusNearby = useBusNearbyStations(
    mode === 'subway' && crossNear ? crossNear.lat : null,
    mode === 'subway' && crossNear ? crossNear.lng : null,
  );
  const crossSubwayNearby = useSubwayNearbyStations(
    mode === 'bus' && crossNear ? crossNear.lat : null,
    mode === 'bus' && crossNear ? crossNear.lng : null,
  );
  const overlayMarkers = useMemo<BridgeMarker[]>(() => {
    // 빠른 선택이 열려 있으면 카드와 동일한 거리순 상위 3개씩을 이름·거리 라벨과
    // 함께 표시한다. 일반 겸표시보다 우선해 두 종류가 한 지도에 동시에 보인다.
    if (quickNear) {
      const buses = quickBusNearby.isPlaceholderData
        ? []
        : (quickBusNearby.data?.items ?? []).slice(0, 3);
      const subways = quickSubwayNearby.isPlaceholderData
        ? []
        : (quickSubwayNearby.data?.items ?? []).slice(0, 3);
      return [
        ...buses.map((s) => ({
          id: `quick-bus:${s.stId}`,
          lat: s.lat,
          lng: s.lng,
          label: `${s.name} · ${s.dist}m`,
          icon: BUS_OVERLAY_URL,
        })),
        ...subways.map((g) => ({
          id: `quick-subway:${g.id}`,
          lat: g.lat,
          lng: g.lng,
          label: `${g.name} · ${g.dist}m`,
          icon: g.lines.length >= 2 ? SUBWAY_OVERLAY_TRANSFER_URL : SUBWAY_OVERLAY_URL,
        })),
      ];
    }
    if (!crossToggleVisible || !crossShow) return EMPTY_OVERLAY;
    if (mode === 'subway') {
      return (crossBusNearby.data?.items ?? []).map((s) => ({
        id: `x-bus:${s.stId}`,
        lat: s.lat,
        lng: s.lng,
        icon: BUS_OVERLAY_URL,
      }));
    }
    return (crossSubwayNearby.data?.items ?? []).map((g) => ({
      id: `x-subway:${g.id}`,
      lat: g.lat,
      lng: g.lng,
      icon: g.lines.length >= 2 ? SUBWAY_OVERLAY_TRANSFER_URL : SUBWAY_OVERLAY_URL,
    }));
  }, [
    quickNear,
    quickBusNearby.data,
    quickBusNearby.isPlaceholderData,
    quickSubwayNearby.data,
    quickSubwayNearby.isPlaceholderData,
    crossToggleVisible,
    crossShow,
    mode,
    crossBusNearby.data,
    crossSubwayNearby.data,
  ]);

  // ── 시트 상태 — restaurants.tsx 패턴 그대로 ────────────────────────────────
  const [headerCardH, setHeaderCardH] = useState(FALLBACK_HEADER_H);
  const listSheetRef = useRef<BottomSheet | null>(null);
  const detailSheetRef = useRef<BottomSheet | null>(null);
  const listSheetIndex = useSharedValue(1);
  const detailSheetIndex = useSharedValue(-1);
  const detailOpenSV = useSharedValue(0);
  // 각 시트 상단 Y(px, 컨테이너=화면 기준). gorhom 이 드래그 중에도 매 프레임
  // 갱신 — 따라가기 칩이 이 값을 따라 시트 위에 붙는다.
  const listSheetTop = useSharedValue(SHEET_TOP_UNSET);
  const detailSheetTop = useSharedValue(SHEET_TOP_UNSET);
  const headerSheetIndex = useDerivedValue(() => {
    'worklet';
    const v = detailOpenSV.value === 1 ? detailSheetIndex.value : listSheetIndex.value;
    return Math.max(0, v);
  });
  const listSnapBeforeDetailRef = useRef(1);

  const detailVisible =
    (mode === 'subway' && stn !== null) || (mode === 'bus' && selectedBusStation !== null);

  const openDetail = useCallback(() => {
    const cur = Math.round(listSheetIndex.value);
    listSnapBeforeDetailRef.current = Math.max(0, Math.min(2, cur));
    detailOpenSV.value = 1;
    listSheetRef.current?.snapToIndex(0);
  }, [listSheetIndex, detailOpenSV]);

  const closeDetail = useCallback(() => {
    detailOpenSV.value = 0;
    listSheetRef.current?.snapToIndex(listSnapBeforeDetailRef.current);
  }, [detailOpenSV]);

  // 따라가기/탑승 시작 = 지도를 보려는 동작 — 열린 시트를 최저 스냅으로 내려
  // 지도를 연다(디테일 시트는 미마운트면 ref 가 null 이라 no-op). 칩은 시트
  // 상단에 앵커돼 있으니 이건 '가림 해소'가 아니라 시야 확보용.
  const collapseSheetsForFollow = useCallback(() => {
    // 디테일을 닫을 때 복귀할 스냅도 peek 으로 — 따라가다 뒤로가기 하면 리스트가
    // 다시 half 로 튀어 지도를 덮던 것 방지.
    listSnapBeforeDetailRef.current = 0;
    listSheetRef.current?.snapToIndex(0);
    detailSheetRef.current?.snapToIndex(0);
  }, []);

  // ── 핸들러 ──────────────────────────────────────────────────────────────
  const dismissSearchAssist = useCallback(() => {
    if (searchBlurTimerRef.current) {
      clearTimeout(searchBlurTimerRef.current);
      searchBlurTimerRef.current = null;
    }
    setSearchFocused(false);
    Keyboard.dismiss();
  }, []);

  const handleChangeMode = useCallback(
    (next: TransitMode) => {
      setSearchDraft(next === 'subway' ? subway.qInput : bus.q);
      dispatch({ type: 'SET_MODE', mode: next });
    },
    [dispatch, subway.qInput, bus.q],
  );

  const handleChangeSubwayQ = useCallback(
    (next: string) => {
      setQuickNear(null);
      dispatch({ type: 'SUBWAY_CHANGE_Q', q: next });
    },
    [dispatch],
  );

  const handleSubmitQ = useCallback(
    (draft: string) => {
      setQuickNear(null);
      const trimmed = draft.trim();
      if (
        (mode === 'subway' && trimmed.length >= 1) ||
        (mode === 'bus' && trimmed.length >= 2)
      ) {
        addRecentQuery(mode, trimmed);
      }
      dismissSearchAssist();
      if (mode === 'subway') {
        // 제출 = 검색어 확정(크로스 조회 채널, M11) — 라이브 검색과 별개.
        dispatch({ type: 'SUBWAY_CHANGE_Q', q: draft });
        dispatch({ type: 'SUBWAY_SUBMIT_Q' });
      } else {
        dispatch({ type: 'BUS_SUBMIT_Q', q: draft.trim() });
        closeDetail();
      }
    },
    [mode, dispatch, closeDetail, addRecentQuery, dismissSearchAssist],
  );

  const handleSelectSubwayStation = useCallback(
    (id: string) => {
      // 새 역이 추적 호선 경유역(id 또는 역명 일치)이면 line 유지 — 환승역
      // 그룹 대표 id 가 다른 lineId 접두라 역명 비교도 병행(웹과 동일).
      const name = id.slice(id.indexOf(':') + 1);
      const onTrackedLine =
        lineStationKeyRef.current.ids.has(id) || lineStationKeyRef.current.names.has(name);
      dismissSearchAssist();
      dispatch({ type: 'SUBWAY_SELECT_STATION', id, onTrackedLine });
      openDetail();
    },
    [dispatch, openDetail, dismissSearchAssist],
  );

  // 경유역 점 클릭 — 환승역은 활성 결과의 그룹 대표 id 로 재해석.
  const handleSelectStop = useCallback(
    (stationId: string) => {
      handleSelectSubwayStation(groupIdByLineStationRef.current.get(stationId) ?? stationId);
    },
    [handleSelectSubwayStation],
  );

  // '노선 보기' 토글 — 같은 호선 재탭이면 해제(stn 유지).
  const handleTrackLine = useCallback(
    (lineId: string) => dispatch({ type: 'SUBWAY_TRACK_LINE', lineId }),
    [dispatch],
  );
  const handleCloseLine = useCallback(
    () => dispatch({ type: 'SUBWAY_CLOSE_LINE' }),
    [dispatch],
  );

  // 도착 패널 '지도에서 보기' — 호선 추적 + 그 열차 따라가기 대기(nonce).
  const handleLocateTrain = useCallback(
    (lineId: string, trainNo: string) => {
      dispatch({ type: 'SUBWAY_LOCATE_TRAIN', lineId, trainNo, nonce: Date.now() });
      collapseSheetsForFollow();
    },
    [dispatch, collapseSheetsForFollow],
  );

  // 시간표 뷰 열기 — 그 호선의 역×호선 stationId 로 전환, dayType 오늘로 리셋.
  const handleOpenTimetable = useCallback(
    (lineId: string) => {
      setTimetableDayType(todayDayType);
      dispatch({
        type: 'SUBWAY_OPEN_TIMETABLE',
        lineId,
        stationId: `${lineId}:${panelStationName}`,
      });
    },
    [dispatch, todayDayType, panelStationName],
  );
  const handleCloseTimetable = useCallback(
    () => dispatch({ type: 'SUBWAY_CLOSE_TIMETABLE' }),
    [dispatch],
  );

  // 길찾기 — 열기(시간표 닫기 + line 해제 배타)/도착역 선택/재선택/닫기.
  const handleOpenPath = useCallback(() => dispatch({ type: 'SUBWAY_OPEN_PATH' }), [dispatch]);
  const handleSelectDest = useCallback(
    (id: string) => dispatch({ type: 'SUBWAY_SELECT_DEST', id }),
    [dispatch],
  );
  const handleClearDest = useCallback(
    () => dispatch({ type: 'SUBWAY_CLEAR_DEST' }),
    [dispatch],
  );
  const handleClosePath = useCallback(
    () => dispatch({ type: 'SUBWAY_CLOSE_PATH' }),
    [dispatch],
  );

  const handleSelectBusStation = useCallback(
    (id: string) => {
      // 새 정류장이 추적 노선의 경유 정류소면 routeId 유지(노선 위 이동).
      dismissSearchAssist();
      dispatch({
        type: 'BUS_SELECT_STATION',
        stId: id,
        onTrackedRoute: busRouteStationIdsRef.current.has(id),
      });
      openDetail();
    },
    [dispatch, openDetail, dismissSearchAssist],
  );

  const handleBack = useCallback(() => {
    dispatch({ type: mode === 'subway' ? 'SUBWAY_BACK' : 'BUS_BACK' });
    closeDetail();
  }, [mode, dispatch, closeDetail]);

  const handleSearchFocusChange = useCallback(
    (nextFocused: boolean) => {
      if (searchBlurTimerRef.current) {
        clearTimeout(searchBlurTimerRef.current);
        searchBlurTimerRef.current = null;
      }
      if (nextFocused) {
        setQuickNear(null);
        if (detailVisible) handleBack();
        setSearchFocused(true);
        listSheetRef.current?.snapToIndex(1);
        return;
      }
      // 최근 행을 누를 때 TextInput blur가 press보다 먼저 와 섹션을 unmount하지
      // 않도록 짧게 지연한다. 선택 핸들러는 즉시 타이머를 취소한다.
      searchBlurTimerRef.current = setTimeout(() => {
        setSearchFocused(false);
        searchBlurTimerRef.current = null;
      }, 160);
    },
    [detailVisible, handleBack],
  );

  const handleUseRecentQuery = useCallback(
    (q: string) => {
      const normalized = q.trim().normalize('NFC');
      setQuickNear(null);
      setSearchDraft(normalized);
      addRecentQuery(mode, normalized);
      dismissSearchAssist();
      if (mode === 'subway') {
        dispatch({ type: 'SUBWAY_CHANGE_Q', q: normalized });
        dispatch({ type: 'SUBWAY_SUBMIT_Q' });
      } else {
        dispatch({ type: 'BUS_SUBMIT_Q', q: normalized });
      }
      listSheetRef.current?.snapToIndex(1);
    },
    [mode, dispatch, addRecentQuery, dismissSearchAssist],
  );

  const handleSelectRecentTarget = useCallback(
    (target: TransitRecentTarget) => {
      setQuickNear(null);
      dismissSearchAssist();
      if (target.kind === 'bus') {
        dispatch({ type: 'CROSS_JUMP_TO_BUS', stId: target.stId, near: null });
      } else {
        dispatch({ type: 'CROSS_JUMP_TO_SUBWAY', stn: target.stationId, near: null });
      }
      openDetail();
    },
    [dispatch, openDetail, dismissSearchAssist],
  );

  const handleRemoveRecentQuery = useCallback(
    (query: TransitRecentQuery) => removeRecentQuery(query.mode, query.q),
    [removeRecentQuery],
  );

  const handleRemoveRecentTarget = useCallback(
    (target: TransitRecentTarget) =>
      removeRecentTarget(
        target.kind,
        target.kind === 'bus' ? target.stId : target.stationId,
      ),
    [removeRecentTarget],
  );

  // '근처' — 현재 모드와 무관하게 버스/지하철 nearby 를 함께 여는 명시 액션.
  // 두 번째 탭은 닫기 동작. 상세 위에서 실행하면 기존 선택을 해제하고 리스트를
  // half 로 올려 후보가 즉시 보이게 한다.
  const handleNearest = useCallback(async () => {
    if (quickNear) {
      setQuickNear(null);
      return;
    }
    const result = await refetchUserLocation();
    if (result.status === 'granted' && result.coords) {
      if (!isInKorea(result.coords)) {
        Alert.alert('서비스 지역 밖', '현재 위치가 서비스 지역(한국) 밖이에요.');
        return;
      }
      if (detailVisible) handleBack();
      setQuickNear({
        lat: roundCoord(result.coords.lat),
        lng: roundCoord(result.coords.lng),
      });
      listSheetRef.current?.snapToIndex(1);
      return;
    }
    if (result.status === 'pending' || result.status === 'idle') return;
    const message =
      result.status === 'denied'
        ? '위치 권한이 꺼져 있어요. 설정에서 허용한 뒤 다시 시도해 주세요.'
        : '이 환경에서는 위치를 사용할 수 없어요. 설정을 확인해 주세요.';
    Alert.alert('위치 권한 필요', message, [
      { text: '취소', style: 'cancel' },
      { text: '설정 열기', onPress: () => Linking.openSettings().catch(() => {}) },
    ]);
  }, [quickNear, refetchUserLocation, detailVisible, handleBack]);

  const handleSelectNearestBus = useCallback(
    (id: string) => {
      if (!quickNear) return;
      dispatch({ type: 'CROSS_JUMP_TO_BUS', stId: id, near: quickNear });
      setQuickNear(null);
      openDetail();
    },
    [quickNear, dispatch, openDetail],
  );

  const handleSelectNearestSubway = useCallback(
    (id: string) => {
      if (!quickNear) return;
      dispatch({ type: 'CROSS_JUMP_TO_SUBWAY', stn: id, near: quickNear });
      setQuickNear(null);
      openDetail();
    },
    [quickNear, dispatch, openDetail],
  );

  const handleToggleBusRoute = useCallback(
    (busRouteId: string) => dispatch({ type: 'BUS_TOGGLE_ROUTE', routeId: busRouteId }),
    [dispatch],
  );

  // 강제 새로고침(버스 키워드 모드) — 서버 60초 스로틀 응답은 안내만.
  const { mutate: busRefreshMutate, isPending: busRefreshPending } = busRefresh;
  const handleForceRefresh = useCallback(() => {
    const t = bus.q.trim();
    if (t.length < 2 || t.length > 50 || busRefreshPending) return;
    busRefreshMutate(bus.q, {
      onSuccess: (data) => {
        if (data.source !== 'api') Alert.alert('알림', '잠시 후 다시 시도해 주세요.');
      },
      onError: () => {
        Alert.alert('알림', '새로고침에 실패했어요. 잠시 후 다시 시도해 주세요.');
      },
    });
  }, [bus.q, busRefreshMutate, busRefreshPending]);

  // 마커 클릭 라우팅 — 차량(veh-/train-)은 vehicle 채널이라 여기 안 옴(방어적
  // 무시). 겸표시(x-)는 M11. 경로 핀(path-/xfer-)은 무시. 경유역 점은 그룹
  // 대표 id 재해석(handleSelectStop). stopIds 는 모델(아래 선언)이 채우는 ref
  // 로 읽는다 — 클릭 시점 최신값이면 충분.
  const subwayStopIdsRef = useRef<Set<string>>(new Set());
  const handleMarkerSelect = useCallback(
    (id: string) => {
      // '근처' 빠른 선택 마커 — 카드 행과 동일한 모드 전환·상세 진입 경로.
      if (id.startsWith('quick-bus:')) {
        handleSelectNearestBus(id.slice('quick-bus:'.length));
        return;
      }
      if (id.startsWith('quick-subway:')) {
        handleSelectNearestSubway(id.slice('quick-subway:'.length));
        return;
      }
      // 겸표시 — 상대 모드로 전환 + near 승계 + 선택(웹 크로스 딥링크 대응).
      if (id.startsWith('x-bus:')) {
        dispatch({
          type: 'CROSS_JUMP_TO_BUS',
          stId: id.slice('x-bus:'.length),
          near: subwayEffectiveNear,
        });
        openDetail();
        return;
      }
      if (id.startsWith('x-subway:')) {
        dispatch({
          type: 'CROSS_JUMP_TO_SUBWAY',
          stn: id.slice('x-subway:'.length),
          near: busEffectiveNear,
        });
        openDetail();
        return;
      }
      if (mode === 'subway') {
        if (isSubwayVehicleId(id) || id.startsWith('path-') || id.startsWith('xfer-')) return;
        if (subwayStopIdsRef.current.has(id)) handleSelectStop(id);
        else handleSelectSubwayStation(id);
      } else {
        if (isBusVehicleId(id)) return;
        handleSelectBusStation(id);
      }
    },
    [
      mode,
      dispatch,
      openDetail,
      subwayEffectiveNear,
      busEffectiveNear,
      handleSelectNearestBus,
      handleSelectNearestSubway,
      handleSelectStop,
      handleSelectSubwayStation,
      handleSelectBusStation,
    ],
  );

  // '주변' — 위치 권한 재확인 후 near 모드 진입(버스 배선은 M5). 거부 시
  // Alert(설정 유도) + 리스트 안내(geoError).
  const handleNearby = useCallback(async () => {
    const geoErrorType = mode === 'subway' ? 'SUBWAY_GEO_ERROR' : 'BUS_GEO_ERROR';
    const result = await refetchUserLocation();
    if (result.status === 'granted' && result.coords) {
      if (!isInKorea(result.coords)) {
        dispatch({
          type: geoErrorType,
          message: '현재 위치가 서비스 지역(한국) 밖이에요.',
        });
        return;
      }
      dispatch({
        type: mode === 'subway' ? 'SUBWAY_SET_NEAR' : 'BUS_SET_NEAR',
        coord: result.coords,
      });
      setQuickNear(null);
      closeDetail();
      return;
    }
    if (result.status === 'pending' || result.status === 'idle') return;
    const message =
      result.status === 'denied'
        ? '위치 권한이 꺼져 있어요. 설정에서 허용한 뒤 다시 시도해 주세요.'
        : '이 환경에서는 위치를 사용할 수 없어요. 설정을 확인해 주세요.';
    dispatch({ type: geoErrorType, message });
    Alert.alert('위치 권한 필요', message, [
      { text: '취소', style: 'cancel' },
      { text: '설정 열기', onPress: () => Linking.openSettings().catch(() => {}) },
    ]);
  }, [mode, refetchUserLocation, dispatch, closeDetail]);

  const handleClearNear = useCallback(() => {
    dispatch({ type: mode === 'subway' ? 'SUBWAY_CLEAR_NEAR' : 'BUS_CLEAR_NEAR' });
    closeDetail();
  }, [mode, dispatch, closeDetail]);

  // '이 위치에서 재검색' — 지도 중심 좌표로 near 교체(명시 액션). 선택 해제.
  const handleResearchAt = useCallback(
    (center: { lat: number; lng: number }) => {
      dispatch({
        type: mode === 'subway' ? 'SUBWAY_RESEARCH_AT' : 'BUS_RESEARCH_AT',
        coord: center,
      });
      closeDetail();
    },
    [mode, dispatch, closeDetail],
  );

  // 지도 자동 재조회 — URL(near) 대신 로컬 좌표만 교체(웹과 동일 정책).
  const handleSubwayAutoResearch = useCallback(
    (center: { lat: number; lng: number }) =>
      dispatch({ type: 'SUBWAY_AUTO_RESEARCH_AT', coord: center }),
    [dispatch],
  );
  const handleBusAutoResearch = useCallback(
    (center: { lat: number; lng: number }) =>
      dispatch({ type: 'BUS_AUTO_RESEARCH_AT', coord: center }),
    [dispatch],
  );

  // 통합 즐겨찾기 '이동' — 상대 도메인이면 모드 전환 + 선택 세팅(CROSS_JUMP).
  // 즐겨찾기 섹션은 초기 화면(q/near 없음)에서만 노출되므로 near 승계는 없다.
  const handleFavNavigate = useCallback(
    (t: TransitFavTarget) => {
      switch (t.kind) {
        case 'bus-station':
          dispatch({ type: 'CROSS_JUMP_TO_BUS', stId: t.stId, near: null });
          break;
        case 'bus-route':
          dispatch({
            type: 'CROSS_JUMP_TO_BUS',
            stId: t.stId,
            routeId: t.busRouteId,
            near: null,
          });
          break;
        case 'subway-station':
        case 'subway-line':
          dispatch({ type: 'CROSS_JUMP_TO_SUBWAY', stn: t.stationId, near: null });
          break;
      }
      openDetail();
    },
    [dispatch, openDetail],
  );

  // 하차 지점 도착 예정 — 지정 시에만 그 역/정류장 도착정보를 조회(쿼터 절약).
  const alightEta = useAlightEta(pinned, alight, focused);
  const handleSetAlight = useCallback(
    (target: AlightTarget) => dispatch({ type: 'SET_ALIGHT', alight: target }),
    [dispatch],
  );
  const handleClearAlight = useCallback(() => dispatch({ type: 'CLEAR_ALIGHT' }), [dispatch]);
  const handleToggleAlightAlert = useCallback(
    (enabled: boolean) => dispatch({ type: 'SET_ALIGHT_ALERT', enabled }),
    [dispatch],
  );

  // ── 탑승 상세 뷰 — 칩 탭으로 열고 Detail 시트 안에 렌더(시간표/길찾기와 같은
  // 뷰 교체 패턴). 역/정류장 선택과 독립이라 시트 mount 게이트를 따로 넓힌다.
  const [ridePanel, setRidePanel] = useState(false);
  const rideOpen = ridePanel && pinned !== null;
  const openRideView = useCallback(() => {
    setRidePanel(true);
    openDetail();
    // 따라가기로 peek 까지 접혀 있으면 읽을 수 있게 half 로. 새로 mount 되는
    // 경우엔 ref 가 아직 null 이고, 그땐 시트 index prop(1)이 같은 결과를 낸다.
    detailSheetRef.current?.snapToIndex(1);
  }, [openDetail]);
  const closeRideView = useCallback(() => {
    setRidePanel(false);
    // 선택된 역/정류장이 없으면 시트 자체를 닫는다(있으면 도착 패널로 복귀).
    if (!detailVisible) closeDetail();
  }, [detailVisible, closeDetail]);
  // 탑승 종료(수동 ✕ / 운행 종료 자동 UNPIN) → 상세 뷰도 함께 닫는다.
  useEffect(() => {
    if (!ridePanel || pinned) return;
    setRidePanel(false);
    if (!detailVisible) closeDetail();
  }, [ridePanel, pinned, detailVisible, closeDetail]);

  // 탑승 상세의 정류장/역 행 탭 — 맥락 밖(다른 모드)이면 모드부터 전환한 뒤
  // 기존 선택 흐름을 그대로 탄다(추적 노선/호선 유지는 각 핸들러가 담당).
  const handleRideSelectBusStation = useCallback(
    (stId: string) => {
      setRidePanel(false);
      if (mode !== 'bus') dispatch({ type: 'SET_MODE', mode: 'bus' });
      handleSelectBusStation(stId);
    },
    [mode, dispatch, handleSelectBusStation],
  );
  const handleRideSelectSubwayStation = useCallback(
    (stationId: string) => {
      setRidePanel(false);
      if (mode !== 'subway') dispatch({ type: 'SET_MODE', mode: 'subway' });
      handleSelectStop(stationId);
    },
    [mode, dispatch, handleSelectStop],
  );

  // Android 하드웨어 백 — 안쪽 뷰부터 순서대로 해제: 탑승 상세 → 시간표/길찾기
  // → 도착 패널 → (통과: 탭 기본 동작). 웹의 브라우저 뒤로가기 부재를 메꾸는
  // 유일한 지점.
  const backStateRef = useRef({ hasTimetable: false, hasPath: false, hasRide: false });
  backStateRef.current = {
    hasTimetable: mode === 'subway' && subway.timetableView !== null,
    hasPath: mode === 'subway' && (subway.pathViewOpen || subway.to !== null),
    hasRide: rideOpen,
  };
  useEffect(() => {
    if (!detailVisible && !rideOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // 탑승 상세가 다른 뷰 위를 덮으므로 가장 먼저 닫는다.
      if (backStateRef.current.hasRide) {
        closeRideView();
        return true;
      }
      if (backStateRef.current.hasTimetable) {
        dispatch({ type: 'SUBWAY_CLOSE_TIMETABLE' });
        return true;
      }
      if (backStateRef.current.hasPath) {
        dispatch({ type: 'SUBWAY_CLOSE_PATH' });
        return true;
      }
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [detailVisible, rideOpen, dispatch, handleBack, closeRideView]);

  // ── 지도 조립 — 활성 모드의 모델만 지도에 스프레드 ──────────────────────────
  const mapRef = useRef<TransitMapHandle | null>(null);
  const quickMapCoords = useMemo(
    () =>
      quickNear
        ? [
            quickNear,
            ...overlayMarkers.map((marker) => ({ lat: marker.lat, lng: marker.lng })),
          ]
        : [],
    [quickNear, overlayMarkers],
  );
  useEffect(() => {
    if (!quickNear) return;
    if (quickMapCoords.length === 1) {
      mapRef.current?.flyTo(quickNear.lat, quickNear.lng, 15);
      return;
    }
    mapRef.current?.fitToCoords(quickMapCoords, 72);
  }, [quickNear, quickMapCoords]);

  const subwayModel = useSubwayMapModel({
    active: mode === 'subway',
    mapRef,
    groups: subwayMapGroups,
    selectedId: stn,
    myLocation: subwayEffectiveNear,
    onAutoResearchAt: subwayNearMode ? handleSubwayAutoResearch : undefined,
    suppressFit: subway.autoNear !== null || subway.line !== null,
    lineDetail: subway.line ? (subwayLineDetail.data ?? null) : null,
    positions: subwayTrainItems,
    pendingFollow: subway.pendingFollow,
    pathResult: pathForMap,
  });
  subwayStopIdsRef.current = subwayModel.stopIds;
  const busModel = useBusMapModel({
    active: mode === 'bus',
    mapRef,
    items: busMapItemsForMap,
    selectedStId: stId,
    myLocation: busEffectiveNear,
    onAutoResearchAt: busNearMode ? handleBusAutoResearch : undefined,
    suppressFit: bus.autoNear !== null || bus.routeId !== null,
    routeLine: busRouteLine,
    routeStops: busRouteStops,
    vehicles: busVehicles,
    vehicleLabel: busVehicleLabel,
    vehicleColor: busRouteColor,
  });

  // 빠른 선택 중에는 기존 검색 마커를 숨겨 후보 오버레이와 클릭이 겹치지 않게
  // 하고, 기준 GPS 좌표를 내 위치 점으로 명확히 표시한다.
  const mapMarkers = quickNear
    ? EMPTY_OVERLAY
    : mode === 'subway'
      ? subwayModel.markers
      : busModel.markers;
  const mapSelectedId = quickNear ? null : mode === 'subway' ? stn : stId;
  const mapMyLocation = quickNear ?? (mode === 'subway' ? subwayEffectiveNear : busEffectiveNear);
  const mapViewportChangeEnd =
    mode === 'subway' ? subwayModel.handleViewportChangeEnd : busModel.handleViewportChangeEnd;
  const research = mode === 'subway' ? subwayModel.research : busModel.research;
  const nearbyFetching =
    mode === 'subway'
      ? subwayNearMode && subwayNearby.isFetching
      : busNearMode && busNearby.isFetching;
  // ── 탑승(핀) 오버레이 — 활성 모드 차량/노선 위에 핀 차량을 합성 ─────────────
  // 핀이 지금 보는 맥락(활성 모델이 이미 그 노선을 그림)이면 모델이 전담하고
  // 오버레이는 비운다(중복 방지). 맥락 밖(다른 모드/다른 노선 탐색 중)이면 raw
  // 좌표 pill + 노선 라인을 덧대 어디를 보든 그 차량이 지도에 유지된다.
  const [pinFollowPaused, setPinFollowPaused] = useState(false);
  const [pinEndedNotice, setPinEndedNotice] = useState<string | null>(null);
  const pinEndedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pin = usePinnedVehicle(pinned, focused);
  const activeVehicles = mode === 'bus' ? busModel.vehicles : subwayModel.vehicles;
  const activeRouteLines = mode === 'bus' ? busModel.routeLines : subwayModel.routeLines;
  const pinnedIsActive =
    pinned !== null &&
    pinned.mode === mode &&
    pinned.routeKey === (mode === 'bus' ? bus.routeId : subway.line);

  const mapVehicles = useMemo(() => {
    const overlay = pinnedIsActive ? null : pin.overlayVehicles;
    if (!overlay || overlay.length === 0) return activeVehicles;
    const seen = new Set(activeVehicles.map((v) => v.id));
    const extra = overlay.filter((v) => !seen.has(v.id));
    return extra.length ? [...activeVehicles, ...extra] : activeVehicles;
  }, [activeVehicles, pin.overlayVehicles, pinnedIsActive]);
  const mapRouteLines = useMemo(() => {
    const overlay = pinnedIsActive ? null : pin.overlayRouteLines;
    if (!overlay || overlay.length === 0) return activeRouteLines;
    return [...(activeRouteLines ?? []), ...overlay];
  }, [activeRouteLines, pin.overlayRouteLines, pinnedIsActive]);

  // 카메라 follow — 핀이 있으면 그 차량(패닝으로 일시정지), 없으면 활성 모델.
  const pinnedBridgeId = pinned
    ? `${pinned.mode === 'bus' ? 'veh-' : 'train-'}${pinned.vehicleId}`
    : null;
  const mapFollowVehicleId = pinnedBridgeId
    ? pinFollowPaused
      ? null
      : pinnedBridgeId
    : mode === 'bus'
      ? busModel.followVehicleId
      : subwayModel.followVehicleId;
  // 버스 15초→14초 / 지하철 30초→28초 tween. 맥락 밖 핀은 그 차량 페이스 우선.
  const mapVehicleTweenMs =
    pinned && !pinnedIsActive
      ? pinned.mode === 'bus'
        ? 14_000
        : 28_000
      : mode === 'bus'
        ? 14_000
        : 28_000;

  // 차량 탭 = 탑승(핀) 토글 — 같은 차량 재탭/맥락 밖 핀 차량 탭은 UNPIN, 그 외는
  // 새 핀(새로 탭한 차량은 활성 노선 소속이라 routeId/line 존재). 활성 모드 차량
  // 이면 모델 내부 follow(강조/카메라)도 토글해 in-context 시각을 유지.
  const busVehicleSelect = busModel.handleVehicleSelect;
  const subwayVehicleSelect = subwayModel.handleVehicleSelect;
  const mapVehicleSelect = useCallback(
    (id: string) => {
      setPinFollowPaused(false);
      if (isBusVehicleId(id)) {
        if (mode === 'bus') busVehicleSelect(id);
        const vehId = id.slice('veh-'.length);
        if (pinned?.mode === 'bus' && pinned.vehicleId === vehId) {
          dispatch({ type: 'UNPIN_VEHICLE' });
        } else if (bus.routeId) {
          dispatch({
            type: 'PIN_VEHICLE',
            pinned: {
              mode: 'bus',
              routeKey: bus.routeId,
              vehicleId: vehId,
              label: busVehicleLabel ?? vehId,
            },
          });
          collapseSheetsForFollow();
        }
      } else if (isSubwayVehicleId(id)) {
        if (mode === 'subway') subwayVehicleSelect(id);
        const trainNo = id.slice('train-'.length);
        if (pinned?.mode === 'subway' && pinned.vehicleId === trainNo) {
          dispatch({ type: 'UNPIN_VEHICLE' });
        } else if (subway.line) {
          const t = subwayTrainItems?.find((x) => x.trainNo === trainNo);
          dispatch({
            type: 'PIN_VEHICLE',
            pinned: {
              mode: 'subway',
              routeKey: subway.line,
              vehicleId: trainNo,
              label: t ? subwayDestinationLabel(t.destinationName) : trainNo,
            },
          });
          collapseSheetsForFollow();
        }
      }
    },
    [
      mode,
      busVehicleSelect,
      subwayVehicleSelect,
      pinned,
      bus.routeId,
      subway.line,
      busVehicleLabel,
      subwayTrainItems,
      dispatch,
      collapseSheetsForFollow,
    ],
  );

  // 지도 패닝으로 follow 끊김 — 핀이 있으면 카메라만 일시정지(핀·오버레이 유지,
  // 칩에서 '다시 따라가기'), 없으면 기존 모델 일시정지.
  const busFollowInterrupted = busModel.handleFollowInterrupted;
  const subwayFollowInterrupted = subwayModel.handleFollowInterrupted;
  const mapFollowInterrupted = useCallback(() => {
    if (pinned) {
      setPinFollowPaused(true);
      return;
    }
    if (mode === 'bus') busFollowInterrupted();
    else subwayFollowInterrupted();
  }, [pinned, mode, busFollowInterrupted, subwayFollowInterrupted]);

  // 탑승 표시 모델 — 패널 렌더와 하차 알림 스케줄이 같은 계산을 봐야 '몇 번째
  // 정차'가 어긋나지 않는다(패널이 닫혀 있어도 알림은 돌아야 하므로 화면 레벨).
  const rideView = useMemo(
    () => buildRideView(pin.detail, pin.label ?? pinned?.label ?? null, alight),
    [pin.detail, pin.label, pinned, alight],
  );
  // 알림 예약 근거가 될 잔여초 — 지하철은 초 카운트다운, 버스는 메시지에서 근사.
  const alightEtaSec = useMemo(() => {
    if (!alight || !alightEta.matched) return null;
    return alight.mode === 'subway'
      ? remainSecSince(alightEta.arrivalSec, alightEta.receivedAt)
      : parseBusArrivalSec(alightEta.message);
  }, [alight, alightEta]);
  // 권한 거부 → 토글을 되돌린다(켜진 것처럼 보이는데 안 울리는 상태 방지).
  const handleAlertDenied = useCallback(
    () => dispatch({ type: 'SET_ALIGHT_ALERT', enabled: false }),
    [dispatch],
  );
  const alightAlertState = useAlightAlert({
    enabled: alightAlert,
    pinned,
    alight,
    stepsAway: rideView.alightSteps,
    etaSec: alightEtaSec,
    label: pin.label ?? pinned?.label ?? null,
    onDenied: handleAlertDenied,
  });

  const follow = mode === 'bus' ? busModel.follow : subwayModel.follow;
  const followLabel =
    mode === 'bus'
      ? busVehicleLabel
        ? `${busVehicleLabel}번 따라가는 중`
        : '버스 따라가는 중'
      : subwayModel.follow.dest
        ? `${subwayModel.follow.dest} 열차 따라가는 중`
        : '열차 따라가는 중';

  // 핀 차량 운행 종료(성공 폴링에 대상 없음) — 자동 UNPIN + 4초 안내 칩.
  // 종료 effect 는 cleanup 을 두지 않는다(UNPIN→pinned=null 재실행 시 타이머가
  // 취소돼 안내가 사라지는 것 방지). 타이머 누수는 언마운트 cleanup 이 처리.
  useEffect(() => {
    if (!pinned || !pin.ended) return;
    dispatch({ type: 'UNPIN_VEHICLE' });
    setPinEndedNotice(
      pinned.mode === 'bus'
        ? '버스 운행이 종료되어 탑승을 멈췄어요.'
        : '열차 운행이 종료되어 탑승을 멈췄어요.',
    );
    if (pinEndedTimerRef.current) clearTimeout(pinEndedTimerRef.current);
    pinEndedTimerRef.current = setTimeout(() => setPinEndedNotice(null), 4_000);
  }, [pinned, pin.ended, dispatch]);
  useEffect(
    () => () => {
      if (pinEndedTimerRef.current) clearTimeout(pinEndedTimerRef.current);
    },
    [],
  );

  // ── 리스트 행 — 판별 유니온(단일 BottomSheetFlatList, children swap 금지) ──
  const busDraftPending =
    mode === 'bus' &&
    searchDraft.trim().normalize('NFC') !== bus.q.trim().normalize('NFC');
  const rows = useMemo<ListRow[]>(() => {
    if (mode === 'subway') {
      return subwayActive.items.map((item) => ({ kind: 'subway-station' as const, item }));
    }
    if (busDraftPending) return [];
    return busActive.items.map((item) => ({ kind: 'bus-station' as const, item }));
  }, [mode, subwayActive.items, busActive.items, busDraftPending]);

  // 헤더 메타 문자열 — 주변: 반경/총수/갱신, 검색: 총수(버스는 갱신 시각 포함).
  const headerMeta =
    mode === 'subway'
      ? subwayNearMode && subwayActive.fetchedAt
        ? `반경 1.5km · 총 ${subwayActive.total}개 · 갱신 ${formatRelativeMin(subwayActive.fetchedAt)}`
        : !subwayNearMode && subwayHasQ && subwayActive.fetchedAt
          ? `총 ${subwayActive.total}개`
          : null
      : busNearMode && busActive.fetchedAt
        ? `반경 500m · 총 ${busActive.total}개 · 갱신 ${formatRelativeMin(busActive.fetchedAt)}`
        : busHasQ && busActive.fetchedAt
          ? `총 ${busActive.total}개 · 갱신 ${formatRelativeMin(busActive.fetchedAt)}`
          : null;

  const truncated = mode === 'subway' ? subwayTruncated : busTruncated;
  const selectedMissing = mode === 'subway' ? subwaySelectedMissing : busSelectedMissing;
  const nearMode = mode === 'subway' ? subwayNearMode : busNearMode;
  const geoError = mode === 'subway' ? subway.geoError : bus.geoError;

  const listTopInset = insets.top + headerCardH;
  const detailTopInset = insets.top;
  const mapTopInset = insets.top + headerCardH + 8;

  const handleMeasureHeader = useCallback(
    (h: number) => setHeaderCardH((prev) => (prev === h ? prev : h)),
    [],
  );

  // ── 따라가기/탑승 칩 앵커 ────────────────────────────────────────────────
  // 두 시트 중 더 위에 있는 것(=작은 Y) 바로 위에 칩을 띄운다. 고정 bottom 이면
  // peek 에서도 시트에 걸리고 디테일 시트(zIndex 30)엔 통째로 가렸다.
  const followChipH = useSharedValue(FOLLOW_CHIP_FALLBACK_H);
  const followChipMinY = mapTopInset + 4;

  const followChipY = useDerivedValue(() => {
    'worklet';
    const sheetTop = Math.min(listSheetTop.value, detailSheetTop.value);
    return sheetTop - followChipH.value - FOLLOW_CHIP_GAP;
  });
  // full 스냅이면 칩이 헤더 밑으로 잠기며 시트 핸들 위를 덮는다 — 페이드아웃
  // (opacity 0 은 RN 에서 터치를 그대로 먹으므로 pointerEvents 도 같이 끈다).
  const [followChipCovered, setFollowChipCovered] = useState(false);
  useAnimatedReaction(
    () => followChipY.value < followChipMinY,
    (covered, prev) => {
      'worklet';
      if (prev !== null && covered === prev) return;
      runOnJS(setFollowChipCovered)(covered);
    },
    [followChipMinY],
  );
  const followChipStyle = useAnimatedStyle(() => {
    'worklet';
    const y = followChipY.value;
    return {
      transform: [{ translateY: Math.max(followChipMinY, y) }],
      opacity: interpolate(
        y,
        [followChipMinY, followChipMinY + 20],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    };
  }, [followChipMinY]);
  const handleMeasureFollowChip = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      if (h > 0) followChipH.value = h;
    },
    [followChipH],
  );
  const followChipPointerEvents = followChipCovered ? 'none' : 'box-none';

  // ── 지도 하단 인셋 — 추적 차량이 시트 뒤에 놓이지 않게 카메라를 위로 보정 ──
  // 지도는 시트 뒤까지 풀블리드라 컨테이너 높이 = 지도 캔버스 높이. 시트가
  // 스냅에 안착할 때만(onChange) 갱신 — 드래그 매 프레임 전송은 브리지 낭비다.
  const [containerH, setContainerH] = useState(0);
  const [mapBottomInset, setMapBottomInset] = useState(0);
  const handleMeasureContainer = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setContainerH((prev) => (prev === h ? prev : h));
  }, []);
  const syncMapBottomInset = useCallback(() => {
    const top = Math.min(listSheetTop.value, detailSheetTop.value);
    if (!containerH || top >= SHEET_TOP_UNSET) return;
    const covered = Math.max(0, Math.round(containerH - top));
    // 잔떨림 억제 — 8dp 미만 변화는 무시(스냅 안착값엔 기기별 소수점이 붙는다).
    setMapBottomInset((prev) => (Math.abs(prev - covered) < 8 ? prev : covered));
  }, [containerH, listSheetTop, detailSheetTop]);
  // 디테일 시트는 조건부 mount — 언마운트 후 남은 값이 앵커/인셋을 끌어올리지
  // 않게 리셋하고, 컨테이너 최초 측정 후에도 한 번 재계산한다.
  useEffect(() => {
    if (!detailVisible) detailSheetTop.value = SHEET_TOP_UNSET;
    syncMapBottomInset();
  }, [detailVisible, detailSheetTop, syncMapBottomInset]);

  // 검색 결과 하단 크로스 섹션(웹 15차) — 지하철 모드는 제출 게이트(submittedQ),
  // 버스 모드는 제출형이라 q 자체가 확정값. 주변/초기 화면엔 미표시.
  const crossSearchContent =
    mode === 'subway' ? (
      !subwayNearMode && subwayTrimmedQ.length >= 1 && subway.submittedQ.trim().length >= 2 ? (
        <BusCrossSection
          q={subway.submittedQ}
          onSelect={(crossStId) => {
            dispatch({
              type: 'CROSS_JUMP_TO_BUS',
              stId: crossStId,
              near: null,
              q: subway.submittedQ,
            });
            openDetail();
          }}
          onMore={() =>
            dispatch({ type: 'CROSS_JUMP_TO_BUS', near: null, q: subway.submittedQ })
          }
        />
      ) : null
    ) : !busNearMode && busHasQ ? (
      <SubwayCrossSection
        q={bus.q}
        onSelect={(crossStn) => {
          dispatch({ type: 'CROSS_JUMP_TO_SUBWAY', stn: crossStn, near: null, q: bus.q });
          openDetail();
        }}
        onMore={() => dispatch({ type: 'CROSS_JUMP_TO_SUBWAY', near: null, q: bus.q })}
      />
    ) : null;

  const renderEmpty = () => {
    // 빠른 선택 섹션이 FlatList header 를 채우므로 기본 빈 상태 안내는 숨긴다.
    if (quickNear) return null;
    if (showRecent) return null;
    if (busDraftPending) {
      return (
        <ListHint
          text={
            searchDraft.trim().length < 2
              ? '검색어는 2자 이상 입력하세요.'
              : '키보드의 검색 버튼을 눌러 정류장을 검색하세요.'
          }
        />
      );
    }
    if (geoError) return <ListHint text={geoError} />;
    const initialScreen =
      mode === 'subway'
        ? !subwayNearMode && subwayTrimmedQ.length === 0
        : !busNearMode && busTrimmedQ.length === 0;
    if (initialScreen) {
      // 초기 화면 — 즐겨찾기가 있으면 통합 섹션, 없으면 기본 안내.
      if (hasFavorites) {
        return (
          <TransitFavoritesSection
            bus={busFavorites}
            subway={subwayFavorites}
            onNavigate={handleFavNavigate}
            pollEnabled={focused}
          />
        );
      }
      return (
        <ListHint
          text={
            mode === 'subway'
              ? '역 이름을 입력해 검색하세요.'
              : '정류장 이름으로 검색하세요. (예: 강남역)'
          }
        />
      );
    }
    if (mode === 'bus' && !busNearMode && busTrimmedQ.length === 1) {
      return <ListHint text="검색어는 2자 이상 입력하세요." />;
    }
    const active = mode === 'subway' ? subwayActive : busActive;
    if (active.loading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      );
    }
    if (active.error) {
      return (
        <View style={styles.center}>
          <Text style={{ color: theme.colors.danger, fontSize: 13 }}>
            {mode === 'subway' ? '역을 불러오지 못했습니다.' : '정류장을 불러오지 못했습니다.'}
          </Text>
          <Pressable
            onPress={() =>
              void (mode === 'subway'
                ? subwayNearMode
                  ? subwayNearby.refetch()
                  : subwaySearch.refetch()
                : busSearch.refetch())
            }
            style={[styles.retryBtn, { borderColor: theme.colors.border }]}
          >
            <Text style={{ color: theme.colors.text, fontSize: 13 }}>재시도</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <ListHint
        text={
          mode === 'subway'
            ? subwayNearMode
              ? '주변에 역이 없습니다.'
              : '검색 결과가 없습니다.'
            : busNearMode
              ? '주변에 정류장이 없습니다.'
              : '검색 결과가 없습니다.'
        }
      />
    );
  };

  if (!resolved) {
    return (
      <View
        style={[styles.container, styles.bootCenter, { backgroundColor: theme.colors.bg }]}
      >
        <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>위치 확인 중…</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.bg }]}
      onLayout={handleMeasureContainer}
    >
      <TransitMapView
        ref={mapRef}
        initialCenter={initialCenter}
        active={focused && appActive}
        markers={mapMarkers}
        selectedId={mapSelectedId}
        myLocation={mapMyLocation}
        overlayMarkers={overlayMarkers}
        routeLines={mapRouteLines}
        vehicles={mapVehicles}
        vehicleTweenMs={mapVehicleTweenMs}
        followVehicleId={mapFollowVehicleId}
        topInset={mapTopInset}
        viewBottomInset={mapBottomInset}
        onSelectMarker={handleMarkerSelect}
        onSelectVehicle={mapVehicleSelect}
        onFollowInterrupted={mapFollowInterrupted}
        onViewportChangeEnd={mapViewportChangeEnd}
      />

      {/* 겸표시 토글 칩 — 우상단(주변 모드 && 집중 모드 아님일 때만). */}
      <TransitCrossToggleChip
        label={mode === 'subway' ? '정류장 표시' : '지하철역 표시'}
        visible={crossToggleVisible}
        top={mapTopInset + 4}
      />

      {/* 지도 상단 칩 — 주변 조회 진행 / '이 위치에서 재검색'(같은 슬롯). */}
      {nearMode && nearbyFetching ? (
        <View style={[styles.mapChipWrap, { top: mapTopInset + 4 }]} pointerEvents="none">
          <View
            style={[
              styles.mapChip,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <ActivityIndicator size="small" />
            <Text style={[styles.mapChipText, { color: theme.colors.textMuted }]}>
              {mode === 'subway' ? '주변 역 불러오는 중…' : '주변 정류장 불러오는 중…'}
            </Text>
          </View>
        </View>
      ) : nearMode && research.show && research.center ? (
        <View style={[styles.mapChipWrap, { top: mapTopInset + 4 }]} pointerEvents="box-none">
          <Pressable
            onPress={() => research.center && handleResearchAt(research.center)}
            style={[
              styles.mapChip,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Text style={[styles.mapChipText, { color: theme.colors.text }]}>
              ↻ 이 위치에서 재검색
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* 노선 정보 카드 — 좌상단(지하철 호선 추적 중). 웹 SubwayStationsMap 카드. */}
      {mode === 'subway' && subway.line && subwayLineDetail.data && subwayModel.lineInfo && (
        <View
          style={[
            styles.lineCard,
            {
              top: mapTopInset + 4,
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <SubwayLineBadge lineId={subwayLineDetail.data.lineId} />
          <View style={styles.lineCardBody}>
            <Text style={[styles.lineCardTitle, { color: theme.colors.text }]}>
              {subwayLineDetail.data.lineName}
            </Text>
            <Text
              style={[styles.lineCardSub, { color: theme.colors.textMuted }]}
              numberOfLines={1}
            >
              {subwayModel.lineInfo.section} · {subwayModel.lineInfo.count}
            </Text>
          </View>
          <Pressable onPress={handleCloseLine} hitSlop={8} accessibilityLabel="노선 닫기">
            <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* 탑승(핀) 상태 — 시트 상단에 붙는 상시 칩(모드·선택 무관). 패닝 일시정지
          시 '다시 따라가기', 운행 종료 시 안내 칩(4초). 종료(✕)=UNPIN. */}
      {pinEndedNotice ? (
        <Animated.View
          style={[styles.followWrap, followChipStyle]}
          pointerEvents={followChipPointerEvents}
          onLayout={handleMeasureFollowChip}
        >
          <View
            style={[
              styles.mapChip,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Text style={[styles.mapChipText, { color: theme.colors.textMuted }]}>
              {pinEndedNotice}
            </Text>
          </View>
        </Animated.View>
      ) : pinned ? (
        <Animated.View
          style={[styles.followWrap, followChipStyle]}
          pointerEvents={followChipPointerEvents}
          onLayout={handleMeasureFollowChip}
        >
          <View
            style={[
              styles.mapChip,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            {pinFollowPaused ? (
              <Pressable onPress={() => setPinFollowPaused(false)} hitSlop={8}>
                <Text style={[styles.mapChipText, { color: theme.colors.text }]}>
                  ▶ 다시 따라가기
                </Text>
              </Pressable>
            ) : (
              // 탭 = 탑승 상세 열기(시트 뷰). 종료는 오른쪽 ✕ 전용.
              <Pressable onPress={openRideView} hitSlop={8} accessibilityLabel="탑승 상세 보기">
                <Text style={[styles.mapChipText, { color: theme.colors.text }]}>
                  {pinned.mode === 'bus' ? '🚌 ' : '🚈 '}
                  {pin.label ?? pinned.label}
                  {/* 하차 지점이 걸려 있으면 칩에도 표시 — 남은 시간 카운트다운은
                      패널에만 둔다(여기서 tick 하면 지도까지 매초 리렌더). */}
                  {alight ? ` · 하차 ${alight.name}` : ' 탑승 중'} ›
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                setPinFollowPaused(false);
                dispatch({ type: 'UNPIN_VEHICLE' });
              }}
              hitSlop={8}
              accessibilityLabel="탑승 종료"
            >
              <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>✕</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      {/* 따라가기 상태 — 시트 상단에 붙는 칩. 추적 중엔 배지+종료, 조작으로
          끊기면 '다시 따라가기' 칩, 운행 종료 시 안내 칩(4초). */}
      {!pinned && !pinEndedNotice && follow && (follow.following || follow.notice) && (
        <Animated.View
          style={[styles.followWrap, followChipStyle]}
          pointerEvents={followChipPointerEvents}
          onLayout={handleMeasureFollowChip}
        >
          {follow.notice ? (
            <View
              style={[
                styles.mapChip,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <Text style={[styles.mapChipText, { color: theme.colors.textMuted }]}>
                {follow.notice}
              </Text>
            </View>
          ) : follow.paused ? (
            <Pressable
              onPress={follow.resume}
              style={[
                styles.mapChip,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <Text style={[styles.mapChipText, { color: theme.colors.text }]}>
                ▶ 다시 따라가기
              </Text>
            </Pressable>
          ) : (
            <View
              style={[
                styles.mapChip,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <Text style={[styles.mapChipText, { color: theme.colors.text }]}>
                {followLabel}
              </Text>
              <Pressable onPress={follow.stop} hitSlop={8} accessibilityLabel="따라가기 종료">
                <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>✕</Text>
              </Pressable>
            </View>
          )}
        </Animated.View>
      )}

      {/* List 시트 — 항상 mount, 단일 FlatList 에 행 데이터만 교체. */}
      <BottomSheet
        ref={listSheetRef}
        index={1}
        snapPoints={SNAP_POINTS}
        topInset={listTopInset}
        animatedIndex={listSheetIndex}
        animatedPosition={listSheetTop}
        onChange={syncMapBottomInset}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        containerStyle={styles.listSheetContainer}
        handleIndicatorStyle={{ backgroundColor: theme.colors.border, width: 36 }}
        backgroundComponent={(bgProps) => (
          <SheetBackground
            {...bgProps}
            sheetIndex={listSheetIndex}
            color={theme.colors.surface}
          />
        )}
      >
        <BottomSheetFlatList
          data={rows}
          keyExtractor={rowKey}
          contentContainerStyle={[styles.listPad, { paddingBottom: tabBarH + 24 }]}
          scrollIndicatorInsets={{ bottom: tabBarH }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: row }: { item: ListRow }) =>
            row.kind === 'subway-station' ? (
              <SubwayStationRow
                item={row.item}
                selected={row.item.id === stn}
                onSelect={handleSelectSubwayStation}
                starContent={
                  <FavoriteStar
                    active={subwayFavorites.isStationFavorite(row.item.id)}
                    onToggle={() =>
                      subwayFavorites.toggleStation({
                        stationId: row.item.id,
                        name: row.item.name,
                        lat: row.item.lat,
                        lng: row.item.lng,
                        lines: row.item.lines.map((l) => l.lineId),
                      })
                    }
                    label={`${row.item.name} 즐겨찾기`}
                  />
                }
              />
            ) : (
              <BusStationRow
                item={row.item}
                selected={row.item.stId === stId}
                onSelect={handleSelectBusStation}
                starContent={
                  <FavoriteStar
                    active={busFavorites.isStationFavorite(row.item.stId)}
                    onToggle={() =>
                      busFavorites.toggleStation({
                        stId: row.item.stId,
                        arsId: row.item.arsId,
                        name: row.item.name,
                        lat: row.item.lat,
                        lng: row.item.lng,
                      })
                    }
                    label={`${row.item.name} 즐겨찾기`}
                  />
                }
              />
            )
          }
          ListHeaderComponent={
            showRecent || quickNear || selectedMissing ? (
              <View>
                {showRecent && (
                  <TransitRecentSection
                    filtering={recentFiltering}
                    queries={visibleRecentQueries}
                    targets={visibleRecentTargets}
                    onUseQuery={handleUseRecentQuery}
                    onSelectTarget={handleSelectRecentTarget}
                    onRemoveQuery={handleRemoveRecentQuery}
                    onRemoveTarget={handleRemoveRecentTarget}
                    onClear={() => clearRecentMode(mode)}
                  />
                )}
                {quickNear && (
                  <NearestTransitSection
                    busItems={
                      quickBusNearby.isPlaceholderData ? [] : (quickBusNearby.data?.items ?? [])
                    }
                    subwayItems={
                      quickSubwayNearby.isPlaceholderData
                        ? []
                        : (quickSubwayNearby.data?.items ?? [])
                    }
                    busLoading={
                      quickBusNearby.isLoading ||
                      (quickBusNearby.isFetching &&
                        (!quickBusNearby.data || quickBusNearby.isPlaceholderData))
                    }
                    subwayLoading={
                      quickSubwayNearby.isLoading ||
                      (quickSubwayNearby.isFetching &&
                        (!quickSubwayNearby.data || quickSubwayNearby.isPlaceholderData))
                    }
                    busError={quickBusNearby.isError}
                    subwayError={quickSubwayNearby.isError}
                    onSelectBus={handleSelectNearestBus}
                    onSelectSubway={handleSelectNearestSubway}
                    onRetryBus={() => void quickBusNearby.refetch()}
                    onRetrySubway={() => void quickSubwayNearby.refetch()}
                    onClose={() => setQuickNear(null)}
                  />
                )}
                {selectedMissing && (
                  <View style={[styles.noticeBox, { backgroundColor: theme.colors.surfaceAlt }]}>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                      {mode === 'subway'
                        ? '선택한 역이 현재 결과에 없습니다.'
                        : '선택한 정류장이 현재 결과에 없습니다.'}
                    </Text>
                  </View>
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={renderEmpty()}
          ListFooterComponent={crossSearchContent}
        />
      </BottomSheet>

      {/* Detail 시트 — 선택 시에만 mount(진입 애니메이션 + race 회피). 핸들을
          끝까지 내려도 닫히지 않고 최저 스냅(20%)까지만 접힌다 — 드래그로 닫으면
          선택(stId/routeId·stn/line)이 통째로 해제되며 리스트로 튕기던 현상 방지.
          닫기는 패널 뒤로가기 버튼 / 안드로이드 하드웨어 백(handleBack)으로만.
          탑승 상세(rideOpen)는 역/정류장 선택과 독립이라 mount 조건에 함께. */}
      {detailVisible || rideOpen ? (
        <BottomSheet
          ref={detailSheetRef}
          index={1}
          snapPoints={SNAP_POINTS}
          topInset={detailTopInset}
          animatedIndex={detailSheetIndex}
          animatedPosition={detailSheetTop}
          onChange={syncMapBottomInset}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          containerStyle={styles.detailSheetContainer}
          handleIndicatorStyle={{ backgroundColor: theme.colors.border, width: 36 }}
          backgroundComponent={(bgProps) => (
            <SheetBackground
              {...bgProps}
              sheetIndex={detailSheetIndex}
              color={theme.colors.surface}
            />
          )}
        >
          {rideOpen ? (
            <RideDetailPanel
              view={rideView}
              onBack={closeRideView}
              onUnpin={() => {
                setPinFollowPaused(false);
                dispatch({ type: 'UNPIN_VEHICLE' });
              }}
              onSelectBusStation={handleRideSelectBusStation}
              onSelectSubwayStation={handleRideSelectSubwayStation}
              alight={alight}
              eta={alightEta}
              onSetAlight={handleSetAlight}
              onClearAlight={handleClearAlight}
              alertEnabled={alightAlert}
              alertDenied={alightAlertState.denied}
              onToggleAlert={handleToggleAlightAlert}
              bottomPad={tabBarH + 24}
            />
          ) : mode === 'subway' && timetableView && stn ? (
            <SubwayTimetable
              stationName={panelStationName}
              lineId={timetableView.lineId}
              timetable={timetableForView}
              isLoading={timetable.isLoading}
              isError={timetable.isError}
              dayType={timetableDayType}
              onDayType={setTimetableDayType}
              onBack={handleCloseTimetable}
              congestion={viewCongestion}
              bottomPad={tabBarH + 24}
            />
          ) : mode === 'subway' && inPathView && stn ? (
            <SubwayPathPanel
              fromName={panelStationName}
              fromId={stn}
              to={subway.to}
              toName={toName}
              path={pathData}
              isLoading={subwayPath.isLoading}
              isError={subwayPath.isError}
              onSelectDest={handleSelectDest}
              onClearDest={handleClearDest}
              onBack={handleClosePath}
              bottomPad={tabBarH + 24}
            />
          ) : mode === 'subway' ? (
            <SubwayArrivalPanel
              stationName={panelStationName}
              lines={panelLines}
              items={subwayArrivalItems}
              fetchedAt={arrivalsForStn?.fetchedAt ?? null}
              isLoading={subwayArrivalLoading}
              isError={subwayArrivals.isError}
              notFound={subwayArrivalNotFound}
              onBack={handleBack}
              onRetry={() => void subwayArrivals.refetch()}
              trackedLineId={subway.line}
              onTrackLine={handleTrackLine}
              onLocateTrain={handleLocateTrain}
              onOpenTimetable={handleOpenTimetable}
              footerTimetable={footerTimetable}
              footerCongestion={footerCongestion}
              onOpenPath={handleOpenPath}
              headerStar={
                stn && selectedCoord
                  ? (lineId) => (
                      <FavoriteStar
                        active={subwayFavorites.isLineFavorite(stn, lineId)}
                        onToggle={() =>
                          subwayFavorites.toggleLine({
                            stationId: stn,
                            lineId,
                            stationName: panelStationName,
                            lat: selectedCoord.lat,
                            lng: selectedCoord.lng,
                          })
                        }
                        label={`${subwayLineName(lineId)} 즐겨찾기`}
                      />
                    )
                  : undefined
              }
              bottomContent={
                selectedCoord ? (
                  <SubwayNearbyBusSection
                    lat={selectedCoord.lat}
                    lng={selectedCoord.lng}
                    onSelect={(crossStId, near) => {
                      dispatch({ type: 'CROSS_JUMP_TO_BUS', stId: crossStId, near });
                      openDetail();
                    }}
                  />
                ) : undefined
              }
              bottomPad={tabBarH + 24}
            />
          ) : selectedBusStation ? (
            <BusArrivalPanel
              station={selectedBusStation}
              items={busArrivalItems}
              fetchedAt={busArrivals.data?.fetchedAt ?? null}
              isLoading={busArrivals.isLoading}
              isFetching={busArrivals.isFetching}
              isPlaceholder={busArrivals.isPlaceholderData}
              isError={busArrivals.isError}
              selectedRouteId={bus.routeId}
              onToggleRoute={handleToggleBusRoute}
              onBack={handleBack}
              onRetry={() => void busArrivals.refetch()}
              routeInfo={busRouteInfo}
              headerStar={
                <FavoriteStar
                  active={busFavorites.isStationFavorite(selectedBusStation.stId)}
                  onToggle={() =>
                    busFavorites.toggleStation({
                      stId: selectedBusStation.stId,
                      arsId: selectedBusStation.arsId,
                      name: selectedBusStation.name,
                      lat: selectedBusStation.lat,
                      lng: selectedBusStation.lng,
                    })
                  }
                  label={`${selectedBusStation.name} 즐겨찾기`}
                />
              }
              routeStar={(arrival) => (
                <FavoriteStar
                  active={busFavorites.isRouteFavorite(
                    selectedBusStation.stId,
                    arrival.busRouteId,
                  )}
                  onToggle={() =>
                    busFavorites.toggleRoute({
                      stId: selectedBusStation.stId,
                      busRouteId: arrival.busRouteId,
                      routeName: arrival.routeName,
                      stationName: selectedBusStation.name,
                      arsId: selectedBusStation.arsId,
                      lat: selectedBusStation.lat,
                      lng: selectedBusStation.lng,
                    })
                  }
                  label={`${arrival.routeName} 즐겨찾기`}
                />
              )}
              bottomPad={tabBarH + 24}
            />
          ) : null}
        </BottomSheet>
      ) : null}

      <TransitFloatingHeader
        mode={mode}
        onChangeMode={handleChangeMode}
        q={mode === 'subway' ? subway.qInput : bus.q}
        onChangeQ={mode === 'subway' ? handleChangeSubwayQ : undefined}
        onSubmitQ={handleSubmitQ}
        onDraftChange={setSearchDraft}
        onSearchFocusChange={handleSearchFocusChange}
        nearMode={nearMode}
        onNearby={() => void handleNearby()}
        onClearNear={handleClearNear}
        nearestActive={quickNear !== null}
        onNearest={() => void handleNearest()}
        meta={headerMeta}
        truncated={truncated}
        stale={mode === 'bus' && !busNearMode ? !!busStale : false}
        refreshing={busRefreshPending}
        onRefresh={mode === 'bus' && !busNearMode && busHasQ ? handleForceRefresh : undefined}
        sheetIndex={headerSheetIndex}
        topInset={insets.top}
        onMeasure={handleMeasureHeader}
      />
    </View>
  );
}

const ListHint = ({ text }: { text: string }) => {
  const theme = useTheme();
  return (
    <View style={[styles.hint, { borderColor: theme.colors.border }]}>
      <Text style={[styles.hintText, { color: theme.colors.textMuted }]}>{text}</Text>
    </View>
  );
};

// 시트 BG — peek/half 라운드 16, full 라운드 0 보간(restaurants 공용 패턴).
const SheetBackground = ({
  style,
  sheetIndex,
  color,
}: BottomSheetBackgroundProps & {
  sheetIndex: SharedValue<number>;
  color: string;
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const idx = sheetIndex.value;
    const t = Math.min(1, Math.max(0, (idx - 1.5) / 0.5));
    return {
      borderTopLeftRadius: 16 * (1 - t),
      borderTopRightRadius: 16 * (1 - t),
    };
  });
  return <Animated.View style={[style, { backgroundColor: color }, animatedStyle]} />;
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  bootCenter: { alignItems: 'center', justifyContent: 'center' },
  listSheetContainer: { zIndex: 20 },
  detailSheetContainer: { zIndex: 30 },
  listPad: { paddingHorizontal: 12, paddingTop: 4 },
  center: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 10,
  },
  retryBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  hint: {
    marginTop: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 28,
    alignItems: 'center',
  },
  hintText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  noticeBox: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  mapChipWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 15,
  },
  mapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  mapChipText: { fontSize: 12, fontWeight: '600' },
  // translateY 로 시트 상단에 앵커 — top 0 기준. zIndex 는 디테일 시트(30) 위.
  followWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 40,
  },
  lineCard: {
    position: 'absolute',
    left: 12,
    maxWidth: '80%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    zIndex: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  lineCardBody: { minWidth: 0, flexShrink: 1 },
  lineCardTitle: { fontSize: 13, fontWeight: '600' },
  lineCardSub: { fontSize: 11 },
});
