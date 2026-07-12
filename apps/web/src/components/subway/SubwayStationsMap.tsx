import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, Navigation, RotateCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, useMapPublicConfig } from '@repo/shared';
import type {
  SubwayLineDetailResultType,
  SubwayLineStationItemType,
  SubwayPathResultType,
  SubwayStationGroupItemType,
  SubwayTrainPositionItemType,
} from '@repo/api-contract';
import {
  approxDistanceM,
  buildMyLocationMarkerDataUrl,
  buildSubwayStationMarkerDataUrl,
  buildSubwayStopDotDataUrl,
  buildSubwayTrainDirDataUrl,
  buildSubwayTrainPillDataUrl,
  createRoutePathIndex,
  locateTrain,
  pointAtRoutePathS,
  sliceForMove,
  subwayDestinationLabel,
  subwayLineColor,
  type LatLng,
  type TrainSection,
} from '@repo/utils';
import {
  MapCanvas,
  type MapCanvasHandle,
  type MapMarker,
  type MapViewport,
  type VehicleMarker,
} from '~/components/restaurant/MapCanvas';
import {
  readTransitViewport,
  saveTransitViewport,
} from '~/components/transit/transitMapViewport';
import { TransitCrossToggleChip } from '~/components/transit/TransitCrossToggleChip';
import { SubwayLineBadge } from './SubwayLineBadge';

// 모듈 레벨 상수 — 선택×환승 4종을 미리 만들어 모든 마커가 같은 data URL 문자열을
// 공유한다(OL 아이콘 캐시가 이미지를 1회만 디코드). 정류장 마커와 규격이 같아
// (26×26 원 / 32×48 핀) MapCanvas 의 라벨 offset·축소 스케일이 그대로 유효하다.
const STATION_URL = buildSubwayStationMarkerDataUrl({ selected: false, transfer: false });
const STATION_SELECTED_URL = buildSubwayStationMarkerDataUrl({ selected: true, transfer: false });
const TRANSFER_URL = buildSubwayStationMarkerDataUrl({ selected: false, transfer: true });
const TRANSFER_SELECTED_URL = buildSubwayStationMarkerDataUrl({ selected: true, transfer: true });
// 내 위치 마커 — 버스와 공용(파란 점). 선택 개념이 없어 1종.
const MY_LOCATION_MARKER_URL = buildMyLocationMarkerDataUrl();
// 내 위치 마커 id — 역 마커와 충돌 없는 고정 id, 클릭은 무시.
const MY_LOCATION_ID = 'my-location';
// 열차 마커 id 접두사 — 전용 vehicles 레이어라 클릭 라우팅과 무관하지만 식별용.
const VEHICLE_ID_PREFIX = 'train-';
// 경로(길찾기) 마커 — 출발/도착 선택 핀 + 환승 도트(중립 회색 도넛). 클릭 무시.
const PATH_TRANSFER_DOT_URL = buildSubwayStopDotDataUrl('#6b7280', true);
// 도착 패널 '지도에서 보기' 대기 마감(ms) — 폴링 1회(30초)+여유. 이 안에 대상
// trainNo 가 positions 에 안 나타나면 대기 해제 + 안내(아직 미진입/방금 종료).
const PENDING_FOLLOW_MS = 32_000;

// 역 선택 시 확대 포커스 목표 줌 — 식당 지도의 ZOOM_IN_LEVEL(및 fitToMarkers
// maxZoom)과 통일한 17. flyToZoomIn 이라 현재 줌이 더 크면 그대로 둔다(줌아웃 없음).
const SUBWAY_SELECT_ZOOM = 17;

// 재검색(수동/자동) 트리거 임계 — 기준점에서 지도 중심이 이만큼 벗어나야. 역 간격이
// 버스 정류장보다 넓어 버스(300m)보다 완화한 500m.
const RESEARCH_THRESHOLD_M = 500;
// 자동 재조회 최소 줌 — 역 밀도가 낮아 버스(15)보다 완화한 13. 그보다 멀면 자동
// 조회는 의미가 없어(30그룹 절단만 남음) 수동 버튼으로 강등.
const AUTO_RESEARCH_MIN_ZOOM = 13;
// 자동 재조회 최소 간격 — 트레일링 예약이라 마지막 이동은 반드시 조회된다.
const AUTO_RESEARCH_MIN_INTERVAL_MS = 1_200;

interface Props {
  // 역명 그룹 — 그룹당 마커 1개(대표 좌표). 2개 이상 호선 = 환승(이중 링).
  groups: SubwayStationGroupItemType[];
  selectedId: string | null;
  onSelect(id: string): void;
  // 주변 모드의 조회 기준점(Geolocation 내 위치 또는 지도 재검색 좌표) — 파란 점
  // 마커. 없으면 미표시.
  myLocation?: { lat: number; lng: number } | null;
  // '이 위치에서 재검색'(수동) — 자동 조건이 아닐 때 버튼으로 지도 중심을 넘긴다.
  onResearchAt?(center: { lat: number; lng: number }): void;
  // 자동 재조회 — 줌이 충분히 가까울 때 사용자 패닝이 끝나면 지도 중심으로 조회.
  onAutoResearchAt?(center: { lat: number; lng: number }): void;
  // 자동 재조회/노선 추적 중 fitToMarkers 억제 — 사용자가 보던 화면을 지도가
  // 되받아치지 않게(노선 경유역 점이 화면을 줌아웃시키지 않게).
  suppressFit?: boolean;
  // 주변 조회 진행 중 — 지도 상단 로딩 칩.
  loading?: boolean;
  // 5차 — 추적 호선 상세(sections). 있으면 폴리라인 + 경유역 점을 그린다.
  lineDetail?: SubwayLineDetailResultType | null;
  // 추적 호선색(subwayLineColor) — 폴리라인·경유역 점 공용.
  lineColor?: string;
  // 경유역 점 클릭 — 역 마커(onSelect)와 분리된 채널(환승역 id 재해석은 호출부에서).
  onSelectStop?(stationId: string): void;
  // 노선 정보 카드 '노선 닫기'.
  onCloseLine?(): void;
  // 6차 — 추적 호선의 실시간 열차 위치(30초 폴링). lineDetail(sections)과 조합해
  // 역간 보간 → 알약 마커 + rAF 이동. line 추적 중일 때만 의미.
  positions?: SubwayTrainPositionItemType[];
  // 7차 도착↔지도 연계 — 도착 패널에서 '지도에서 보기'한 열차. nonce 로 매 요청을
  // 구분(같은 열차 재요청도 재발화). 그 trainNo 가 positions 에 나타나면 1회 follow.
  pendingFollow?: { trainNo: string; nonce: number } | null;
  // 11차 경로 모드 — 있으면 leg 폴리라인(leg별 호선색) + 출발/도착 핀 + 환승 도트만
  // 그리고 나머지(검색 역·경유역 점·열차·내 위치)는 숨긴다. 경로 전체로 fit(1회).
  pathResult?: SubwayPathResultType | null;
  // MapCanvas 지도 인스턴스 풀 키 — 그대로 전달한다. 키 결정(레이아웃별 분리
  // 등)은 호출자 몫. 미지정이면 풀링 없이 기존 동작.
  poolKey?: string;
  // 통합 겸표시 — 주변 모드에 함께 그릴 정류장 마커(id 는 'x-bus:' prefix).
  // MapCanvas 의 fit 제외 오버레이 레이어로 넘긴다(자기 역 fit 을 안 넓힘).
  overlayMarkers?: MapMarker[];
  // 겸표시 마커 클릭 — prefix id 를 그대로 넘긴다(호출자가 버스 탭 딥링크).
  onOverlaySelect?(id: string): void;
  // 겸표시 토글 칩 노출 여부(주변 모드 && 집중 모드 아님).
  crossToggleVisible?: boolean;
  className?: string;
}

// 역 검색/주변/노선 결과를 vworld 지도에 마커+폴리라인으로. 키 로딩/미등록/에러
// 3분기는 BusStationsMap 과 동일 정책(문구만 지하철용). 자동 재조회 파이프라인은
// 버스 3차 검증본 이식. 노선 형상은 MapCanvas routeLine(별도 소스)이라 fit 대상에서
// 제외되고, 경유역 점은 마커 소스라 노선 추적 중 suppressFit 로 줌아웃을 막는다.
export const SubwayStationsMap = ({
  groups,
  selectedId,
  onSelect,
  myLocation,
  onResearchAt,
  onAutoResearchAt,
  suppressFit,
  loading,
  lineDetail,
  lineColor,
  onSelectStop,
  onCloseLine,
  positions,
  pendingFollow,
  pathResult,
  poolKey,
  overlayMarkers,
  onOverlaySelect,
  crossToggleVisible,
}: Props) => {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  // 키 미등록은 404 — ApiError statusCode 로 분기.
  const keyMissing =
    config.isError && config.error instanceof ApiError && config.error.statusCode === 404;

  const handleRef = useRef<MapCanvasHandle>(null);

  // 탭 전환 뷰포트 이어보기 — 마운트 시 공유 싱글턴에서 초기 뷰 복원(없으면 기본
  // 뷰), moveend(onViewportSync)마다 저장. 저장 뷰포트로 시작했으면 아래 fit effect
  // 가 첫 검색 fit 1회를 억제해 복원이 즉시 덮이지 않게 한다.
  const [initialViewport] = useState(() => readTransitViewport());
  const restoreGuardRef = useRef(initialViewport !== null);
  const handleViewportSync = useCallback((vp: MapViewport) => {
    saveTransitViewport({ lat: vp.centerLat, lng: vp.centerLng, zoom: vp.zoom });
  }, []);

  // ── 7차 열차 따라가기 (버스 8차 미러) ──────────────────────────────────────
  // 알약 탭 → 그 열차(followId = VehicleMarker.id = 'train-'+trainNo) 카메라 추적.
  // paused 는 사용자가 지도를 조작해 추적만 끊긴 상태(followId 유지, '다시 따라가기'
  // 로 재개). 카메라는 MapCanvas rAF 소유 — 여기선 대상 id 만 내린다.
  const [followId, setFollowId] = useState<string | null>(null);
  const [followPaused, setFollowPaused] = useState(false);
  // 도착 패널 '지도에서 보기' 대기 — 대상이 아직 positions 에 없을 때 무장하고,
  // 나타나는 폴링에 follow 시작한다(타이머는 마감 백스톱 1개뿐).
  const pendingRef = useRef<{ trainNo: string } | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPending = useCallback(() => {
    pendingRef.current = null;
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }, []);
  const handleVehicleSelect = useCallback(
    (id: string) => {
      clearPending();
      setFollowPaused(false);
      setFollowId((prev) => (prev === id ? null : id)); // 같은 열차 재탭 → 해제
    },
    [clearPending],
  );
  const handleFollowInterrupted = useCallback(() => setFollowPaused(true), []);
  const handleResumeFollow = useCallback(() => setFollowPaused(false), []);
  const handleStopFollow = useCallback(() => {
    setFollowId(null);
    setFollowPaused(false);
  }, []);
  // paused 아닐 때만 추적 대상을 내린다 — 조작으로 끊기면 null, 재개 시 다시 id.
  const followVehicleId = followId && !followPaused ? followId : null;
  const following = followId !== null;
  // 추적 배지 라벨 — 따라가는 열차의 행선지.
  const followedDest = useMemo(() => {
    if (!followId || !positions) return '';
    const t = positions.find((p) => `${VEHICLE_ID_PREFIX}${p.trainNo}` === followId);
    return t ? subwayDestinationLabel(t.destinationName) : '';
  }, [followId, positions]);

  // 폴리라인 — 경로 모드면 leg별 폴리라인(호선색), 아니면 추적 호선 sections. leg 는
  // 이미 탑승~하차 순서라 그대로 잇고, 노선 sections 는 지선을 개별 줄로(지그재그
  // 방지) + 순환 닫기.
  const routeLines = useMemo(() => {
    if (pathResult) {
      if (!pathResult.found) return null;
      return pathResult.legs.map((leg) => ({
        points: leg.stations.map((s) => ({ lat: s.lat, lng: s.lng })),
        color: subwayLineColor(leg.lineId),
      }));
    }
    if (!lineDetail || !lineColor) return null;
    return lineDetail.sections.map((sec) => {
      const points = sec.stations.map((s) => ({ lat: s.lat, lng: s.lng }));
      if (sec.isLoop && points.length > 1) points.push({ ...points[0]! });
      return { points, color: lineColor };
    });
  }, [pathResult, lineDetail, lineColor]);

  // 경유역 점 — 추적 호선의 stations(중복 stationId 제거). 활성 결과(groups)에 같은
  // 역명 그룹이 이미 있으면 그 마커가 우선이라 점을 생략(환승역 이중 마커 방지).
  const lineStops = useMemo<SubwayLineStationItemType[]>(() => {
    if (!lineDetail) return [];
    const groupNames = new Set(groups.map((g) => g.name));
    const seen = new Set<string>();
    const out: SubwayLineStationItemType[] = [];
    for (const sec of lineDetail.sections) {
      for (const st of sec.stations) {
        if (seen.has(st.stationId)) continue;
        seen.add(st.stationId);
        if (groupNames.has(st.name)) continue;
        out.push(st);
      }
    }
    return out;
  }, [lineDetail, groups]);

  const stopIds = useMemo(() => new Set(lineStops.map((s) => s.stationId)), [lineStops]);
  // 점 마커 2종(일반/환승) — 호선색 고정이라 memo 로 공유(OL 아이콘 캐시).
  const stopDotUrl = useMemo(
    () => (lineColor ? buildSubwayStopDotDataUrl(lineColor, false) : ''),
    [lineColor],
  );
  const stopDotTransferUrl = useMemo(
    () => (lineColor ? buildSubwayStopDotDataUrl(lineColor, true) : ''),
    [lineColor],
  );

  const markers: MapMarker[] = useMemo(() => {
    // 경로 모드 — 출발/도착 핀 + 환승 도트만(검색 역·경유역 점·내 위치는 숨김). 좌표는
    // path.from/to 에 없고 legs 에만 있어 leg 양 끝에서 취한다. 경계=환승.
    if (pathResult) {
      if (!pathResult.found || pathResult.legs.length === 0) return [];
      const legs = pathResult.legs;
      const firstLeg = legs[0]!;
      const lastLeg = legs[legs.length - 1]!;
      const start = firstLeg.stations[0]!;
      const end = lastLeg.stations[lastLeg.stations.length - 1]!;
      // 환승점 — 두 번째 leg 부터 각 leg 의 첫 역(앞 leg 마지막 역과 같은 물리 역).
      const transfers: MapMarker[] = legs.slice(1).map((leg) => {
        const s = leg.stations[0]!;
        return {
          id: `xfer-${leg.lineId}-${s.stationId}`,
          lat: s.lat,
          lng: s.lng,
          icon: { src: PATH_TRANSFER_DOT_URL, selectedSrc: PATH_TRANSFER_DOT_URL },
        };
      });
      return [
        ...transfers,
        {
          id: 'path-from',
          lat: start.lat,
          lng: start.lng,
          label: start.name,
          icon: { src: STATION_SELECTED_URL, selectedSrc: STATION_SELECTED_URL },
        },
        {
          id: 'path-to',
          lat: end.lat,
          lng: end.lng,
          label: end.name,
          icon: { src: STATION_SELECTED_URL, selectedSrc: STATION_SELECTED_URL },
        },
      ];
    }
    // 따라가기 중에는 화면을 비워 열차에 집중 — 검색 역·경유역 점을 숨기고 선택 역
    // 하나만 남긴다(폴리라인·열차는 별도 레이어라 그대로). 버스 8차 미러.
    if (following) {
      const sel = selectedId ? groups.find((g) => g.id === selectedId) : undefined;
      if (!sel) return [];
      const transfer = sel.lines.length > 1;
      return [
        {
          id: sel.id,
          lat: sel.lat,
          lng: sel.lng,
          label: sel.name,
          icon: transfer
            ? { src: TRANSFER_URL, selectedSrc: TRANSFER_SELECTED_URL }
            : { src: STATION_URL, selectedSrc: STATION_SELECTED_URL },
        },
      ];
    }
    // 경유역 점을 먼저(아래) 그려 역 마커/내 위치가 위에 오게 한다. 라벨 없음.
    const stopMarkers: MapMarker[] = lineStops.map((s) => {
      const url = s.isTransfer ? stopDotTransferUrl : stopDotUrl;
      return {
        id: s.stationId,
        lat: s.lat,
        lng: s.lng,
        icon: { src: url, selectedSrc: url },
      };
    });
    const stationMarkers: MapMarker[] = groups.map((g) => {
      const transfer = g.lines.length > 1;
      return {
        id: g.id,
        lat: g.lat,
        lng: g.lng,
        label: g.name,
        icon: transfer
          ? { src: TRANSFER_URL, selectedSrc: TRANSFER_SELECTED_URL }
          : { src: STATION_URL, selectedSrc: STATION_SELECTED_URL },
      };
    });
    const out = [...stopMarkers, ...stationMarkers];
    if (myLocation) {
      out.push({
        id: MY_LOCATION_ID,
        lat: myLocation.lat,
        lng: myLocation.lng,
        icon: { src: MY_LOCATION_MARKER_URL, selectedSrc: MY_LOCATION_MARKER_URL },
      });
    }
    return out;
  }, [
    groups,
    myLocation,
    lineStops,
    stopDotUrl,
    stopDotTransferUrl,
    following,
    selectedId,
    pathResult,
  ]);

  // 사용자가 직접 패닝/줌을 끝낸 시점의 지도 상태 — MapCanvas 가 programmatic
  // move(fit/flyTo)는 걸러주므로 여기엔 사용자 이동만 쌓인다.
  const [userView, setUserView] = useState<{ lat: number; lng: number; zoom: number } | null>(
    null,
  );
  const lastAutoAtRef = useRef(0);
  // 트레일링 예약 타이머 — 스로틀 간격 안에 온 이벤트를 버리지 않고 남은 시간 뒤에
  // 마지막 좌표로 발사한다(드롭하면 "패닝을 멈췄는데 조회가 영영 안 나가는" 미표시).
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    },
    [],
  );
  const handleViewportChangeEnd = useCallback(
    (vp: MapViewport) => {
      const center = { lat: vp.centerLat, lng: vp.centerLng };
      setUserView({ ...center, zoom: vp.zoom });
      // 자동 재조회 — 줌이 충분히 가깝고 기준점에서 임계 이상 벗어났을 때만.
      if (
        onAutoResearchAt &&
        myLocation &&
        vp.zoom >= AUTO_RESEARCH_MIN_ZOOM &&
        approxDistanceM(myLocation, center) > RESEARCH_THRESHOLD_M
      ) {
        if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
        const fire = () => {
          lastAutoAtRef.current = Date.now();
          onAutoResearchAt(center);
        };
        const wait = AUTO_RESEARCH_MIN_INTERVAL_MS - (Date.now() - lastAutoAtRef.current);
        if (wait <= 0) fire();
        else autoTimerRef.current = setTimeout(fire, wait);
      }
    },
    [onAutoResearchAt, myLocation],
  );

  // 수동 재검색 버튼 — 기준점에서 임계 이상 벗어났지만 자동 조건이 아닐 때(줌이
  // 멀거나 자동 핸들러 미지정). 재검색 직후엔 기준점=지도 중심(dist≈0)이라 숨는다.
  const autoActive =
    !!onAutoResearchAt && userView !== null && userView.zoom >= AUTO_RESEARCH_MIN_ZOOM;
  const showResearch =
    !!onResearchAt &&
    !autoActive &&
    !!myLocation &&
    userView !== null &&
    approxDistanceM(myLocation, userView) > RESEARCH_THRESHOLD_M;

  // 결과가 갱신되면 전체 마커가 보이게 fit. apiKey 가 늦게 와서 MapCanvas mount
  // 이전에 groups 가 먼저 도착한 경우를 위해 apiKey 도 deps 에 포함한다. 자동
  // 재조회/노선 추적(suppressFit)은 사용자가 보던 화면을 유지한다. deps 는 groups
  // 만 — 노선 경유역 점(markers)이 바뀌어도 fit 하지 않는다(줌아웃 방지).
  useEffect(() => {
    if (!apiKey) return;
    // 첫 apiKey 런(≈마운트)에서만 복원 가드가 살아 있다 — 이후엔 항상 정상 fit(사용자
    // 새 검색은 억제하지 않게). 데이터가 없는 bare 마운트에서도 이 런에 가드를 소진한다.
    const armed = restoreGuardRef.current;
    restoreGuardRef.current = false;
    if (suppressFit || pathResult) return; // 경로 모드는 전용 fit(아래).
    if (groups.length > 0) {
      // 저장 뷰포트로 시작한 마운트에 이미 결과가 있으면 첫 fit 1회 억제(복원 유지).
      if (armed && initialViewport) return;
      // 주변 모드면 기준점 마커도 markers 에 포함돼 함께 fit 된다.
      handleRef.current?.fitToMarkers();
    } else if (myLocation) {
      // 주변에 역이 하나도 없을 때 — 최소한 기준점으로 센터링.
      handleRef.current?.flyTo(myLocation.lat, myLocation.lng);
    }
  }, [groups, apiKey, myLocation, suppressFit, pathResult, initialViewport]);

  // 경로 로드 시 경로 전체가 보이게 fit — 결과가 바뀔 때 1회(ref 가드). 폴리라인은
  // 별도 소스라 fitToMarkers 로는 안 잡혀 leg 좌표로 fitToCoords 한다.
  const pathFitRef = useRef<SubwayPathResultType | null>(null);
  useEffect(() => {
    if (!apiKey || !pathResult || !pathResult.found) return;
    if (pathFitRef.current === pathResult) return;
    pathFitRef.current = pathResult;
    const coords = pathResult.legs.flatMap((leg) =>
      leg.stations.map((s) => ({ lat: s.lat, lng: s.lng })),
    );
    if (coords.length > 0) handleRef.current?.fitToCoords(coords);
  }, [pathResult, apiKey]);

  // 선택 역으로 확대 포커스 — "선택이 바뀐 순간" 1회만 발사(데이터 갱신마다 재센터링
  // 금지 — ref 가드). 대상은 활성 결과(groups) 우선, 없으면 경유역 점(lineStops) —
  // 노선 위 점을 클릭해 목록에 없는 역을 골라도 지도가 그 역으로 이동한다. 경로
  // 모드에서는 카메라를 경로 fit 이 쥐므로 선택 flyTo 는 쉰다.
  const flownIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (pathResult) return;
    if (!selectedId) {
      flownIdRef.current = null;
      return;
    }
    if (!apiKey || flownIdRef.current === selectedId) return;
    const target =
      groups.find((g) => g.id === selectedId) ??
      lineStops.find((s) => s.stationId === selectedId);
    if (!target) return;
    flownIdRef.current = selectedId;
    handleRef.current?.flyToZoomIn(target.lat, target.lng, SUBWAY_SELECT_ZOOM);
  }, [selectedId, groups, lineStops, apiKey, pathResult]);

  // 마커 클릭 라우팅 — 내 위치·경로 마커는 무시, 경유역 점은 onSelectStop(id 재해석),
  // 나머지는 역 마커라 onSelect(그룹 id 그대로).
  const handleMarkerSelect = useCallback(
    (id: string) => {
      // 겸표시(정류장) 마커 — 자기 도메인 선택이 아니라 상대 탭 딥링크. 다른
      // 무시/선택 로직보다 먼저 가로챈다.
      if (id.startsWith('x-')) {
        onOverlaySelect?.(id);
        return;
      }
      if (id === MY_LOCATION_ID || id.startsWith('path-') || id.startsWith('xfer-')) return;
      if (stopIds.has(id)) onSelectStop?.(id);
      else onSelect(id);
    },
    [onSelect, onSelectStop, stopIds, onOverlaySelect],
  );

  // 노선 정보 카드 — 본선 구간/역 수. 본선(branchName null) 기준, 순환선은 구간 대신 표기.
  const lineInfo = useMemo(() => {
    if (!lineDetail) return null;
    const main =
      lineDetail.sections.find((s) => s.branchName === null) ?? lineDetail.sections[0];
    if (!main) return null;
    const branches = lineDetail.sections.filter((s) => s !== main);
    const first = main.stations[0]?.name ?? '';
    const last = main.stations[main.stations.length - 1]?.name ?? '';
    const section = main.isLoop ? '순환선' : `${first} ↔ ${last}`;
    const count =
      `본선 ${main.stations.length}역` + (branches.length ? ` · 지선 ${branches.length}` : '');
    return { section, count };
  }, [lineDetail]);

  // ── 6차 실시간 열차 — section 마다 RoutePathIndex 를 구축(순환은 첫 좌표 복제로
  //    닫는다). subwayPosition.locateTrain 이 이 기하로 역간 호길이를 잡는다. ──
  const trainSections = useMemo(() => {
    if (!lineDetail) return null;
    const list: TrainSection[] = [];
    for (const sec of lineDetail.sections) {
      const coords = sec.stations.map((s) => ({ lat: s.lat, lng: s.lng }));
      const pts = sec.isLoop && coords.length > 1 ? [...coords, { ...coords[0]! }] : coords;
      const index = createRoutePathIndex(pts);
      if (!index) continue;
      list.push({
        sectionKey: sec.branchKey,
        index,
        isLoop: sec.isLoop,
        byName: new Map(sec.stations.map((s, i) => [s.name, i])),
        stationCount: sec.stations.length,
      });
    }
    if (list.length === 0) return null;
    return { list, byKey: new Map(list.map((s) => [s.sectionKey, s])) };
  }, [lineDetail]);

  // 폴링 세대별 열차 호길이 스냅샷 — cur 는 이번 positions 의 (sectionKey,s), prev 는
  // 직전 폴링. 같은 positions 로 memo 가 재실행돼도(deps 변화·StrictMode 이중 호출)
  // prev 가 밀리지 않아 via 가 일관되게 나온다(버스 vehPollRef 패턴 — useMemo 내부에서만 갱신).
  const vehPollRef = useRef<{
    sections: unknown;
    cur: { v: unknown; s: Map<string, { sectionKey: string; s: number }> } | null;
    prev: Map<string, { sectionKey: string; s: number }> | null;
  }>({ sections: null, cur: null, prev: null });

  const vehicleItems = useMemo<VehicleMarker[]>(() => {
    if (!trainSections || !positions || positions.length === 0) {
      vehPollRef.current = { sections: trainSections, cur: null, prev: null };
      return [];
    }
    const store = vehPollRef.current;
    // 노선(형상)이 바뀌면 s 공간 자체가 달라진다 — 스냅샷 전부 리셋.
    if (store.sections !== trainSections) {
      store.sections = trainSections;
      store.cur = null;
      store.prev = null;
    }
    if (store.cur === null || store.cur.v !== positions) {
      store.prev = store.cur === null ? null : store.cur.s;
      store.cur = { v: positions, s: new Map() };
    } else {
      store.cur.s = new Map(); // 같은 폴링 재계산 — cur 만 다시 채운다.
    }
    const prevS = store.prev;
    const curS = store.cur.s;
    const color = lineColor ?? '#6b7280';
    const dirUrl = buildSubwayTrainDirDataUrl(color);
    const out: VehicleMarker[] = [];
    for (const t of positions) {
      const loc = locateTrain(trainSections.list, {
        statnNm: t.statnNm,
        trainStatus: t.trainStatus,
        updnLine: t.updnLine,
        destinationName: t.destinationName,
      });
      let lat: number;
      let lng: number;
      let via: LatLng[] | undefined;
      let bearingDeg: number | null = null;
      if (loc) {
        const sec = trainSections.byKey.get(loc.sectionKey)!;
        const p = pointAtRoutePathS(sec.index, loc.s);
        lat = p.lat;
        lng = p.lng;
        bearingDeg = loc.bearing;
        curS.set(t.trainNo, { sectionKey: loc.sectionKey, s: loc.s });
        // 같은 section 안에서만 도로 슬라이스 — 세그먼트 전환(지선↔본선)은 직선 폴백.
        const prev = prevS?.get(t.trainNo);
        if (prev && prev.sectionKey === loc.sectionKey) {
          via = sliceForMove(sec.index, prev.s, loc.s, { isLoop: sec.isLoop }) ?? undefined;
        }
      } else if (t.lat !== null && t.lng !== null) {
        // 노선 순서에 없는 역(형상 밖) — 서버 enrich 좌표로 강등(보간 없음).
        lat = t.lat;
        lng = t.lng;
      } else {
        continue; // 좌표 없음 → 스킵.
      }
      // 행선지 라벨 — '종착'→'행'('성수종착'→'성수행'), '지선'은 그대로('성수지선'),
      // 일반 역명은 '행' 접미('신도림'→'신도림행'). 따라가는 대상만 강조 알약.
      const id = `${VEHICLE_ID_PREFIX}${t.trainNo}`;
      const iconSrc = buildSubwayTrainPillDataUrl({
        label: subwayDestinationLabel(t.destinationName),
        color,
        stopped: t.trainStatus === '1',
        express: t.expressType !== null,
        highlighted: id === followId,
      });
      out.push({
        id,
        lat,
        lng,
        via,
        iconSrc,
        dirIconSrc: dirUrl,
        bearingDeg,
      });
    }
    return out;
  }, [trainSections, positions, lineColor, followId]);

  // 도착 패널 '지도에서 보기' 요청(nonce) — 대상이 이미 지도에 있으면 즉시 follow,
  // 없으면 무장 + 마감 타이머 1개. (즉시 판정에만 vehicleItems 를 읽어 deps 는
  // 요청만 — 매 폴링 재무장 방지. 나타날 때 follow 는 아래 effect 담당.)
  useEffect(() => {
    if (!pendingFollow) return;
    const id = `${VEHICLE_ID_PREFIX}${pendingFollow.trainNo}`;
    if (vehicleItems.some((v) => v.id === id)) {
      clearPending();
      setFollowPaused(false);
      setFollowId(id);
      return;
    }
    pendingRef.current = { trainNo: pendingFollow.trainNo };
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      if (pendingRef.current) {
        pendingRef.current = null;
        // 여러 지도 인스턴스(데스크톱/모바일)가 동시에 울리지 않게 고정 id 로 dedup.
        toast.info(
          '열차를 지도에서 찾지 못했습니다. 아직 노선에 진입하지 않았거나 방금 운행을 마쳤을 수 있어요.',
          { id: 'subway-locate-notfound' },
        );
      }
    }, PENDING_FOLLOW_MS);
    return () => {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFollow]);

  // 무장된 대기 대상이 폴링에 나타나면 follow 시작(1회).
  useEffect(() => {
    const pend = pendingRef.current;
    if (!pend) return;
    const id = `${VEHICLE_ID_PREFIX}${pend.trainNo}`;
    if (vehicleItems.some((v) => v.id === id)) {
      clearPending();
      setFollowPaused(false);
      setFollowId(id);
    }
  }, [vehicleItems, clearPending]);

  // 추적 대상이 지도에서 사라지면(운행 종료·구간 이탈·노선 해제) 따라가기 해제.
  // 노선 해제(형상 없음)는 조용히, 운행 중 소멸은 안내(dedup id). 외부(폴링) 이벤트라
  // effect 가 적합 — vehicleItems 갱신 시에만 판정.
  useEffect(() => {
    if (followId === null) return;
    if (vehicleItems.some((v) => v.id === followId)) return;
    setFollowId(null);
    setFollowPaused(false);
    if (lineDetail) {
      toast.info('열차 운행이 종료되어 따라가기를 멈췄어요.', { id: 'subway-follow-ended' });
    }
  }, [vehicleItems, lineDetail, followId]);

  // 언마운트 시 대기 타이머 정리.
  useEffect(() => () => clearPending(), [clearPending]);

  if (config.isLoading) {
    return (
      <Placeholder>
        <Loader2 className="size-4 animate-spin" /> 지도 키 확인 중…
      </Placeholder>
    );
  }
  if (keyMissing) {
    return (
      <Placeholder>
        <MapPin className="size-4 opacity-50" />
        <div className="text-center">
          지도 키가 등록되지 않았습니다.
          <br />
          관리자가 설정 &gt; 지도에서 vworld 키를 등록하면 역 지도가 표시됩니다.
        </div>
      </Placeholder>
    );
  }
  if (config.isError || !apiKey) {
    return <Placeholder>지도 설정을 불러오지 못했습니다.</Placeholder>;
  }

  return (
    <div className="relative size-full">
      <MapCanvas
        ref={handleRef}
        apiKey={apiKey}
        // 탭 전환 시 OL Map 인스턴스 재사용(타일 플래시 제거). 키는 호출자가 지정.
        poolKey={poolKey}
        markers={markers}
        initialCenter={
          initialViewport
            ? { lat: initialViewport.lat, lng: initialViewport.lng, zoom: initialViewport.zoom }
            : undefined
        }
        selectedMarkerId={selectedId}
        onMarkerSelect={handleMarkerSelect}
        onViewportChangeEnd={handleViewportChangeEnd}
        onViewportSync={handleViewportSync}
        routeLine={routeLines}
        vehicles={vehicleItems}
        // 역 단위 30초 폴링이라 버스(14초)보다 길게 — 폴링 간 등속 이동이 이어지게.
        vehicleTweenMs={28_000}
        onVehicleSelect={handleVehicleSelect}
        followVehicleId={followVehicleId}
        onFollowInterrupted={handleFollowInterrupted}
        overlayMarkers={overlayMarkers}
      />
      {/* 겸표시 토글 칩 — 우상단. 주변 모드 && 집중 모드 아님일 때만(crossToggleVisible). */}
      <TransitCrossToggleChip label="정류장 표시" visible={!!crossToggleVisible} />
      {/* 노선 정보 카드 — 좌상단(로딩·재검색 칩은 상단 중앙이라 겹치지 않는다). */}
      {lineDetail && lineInfo && (
        <div className="absolute left-3 top-3 z-10 flex max-w-[85%] items-center gap-2 rounded-lg border bg-background/95 px-3 py-1.5 shadow-md">
          <SubwayLineBadge lineId={lineDetail.lineId} />
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">{lineDetail.lineName}</div>
            <div className="truncate text-xs text-muted-foreground">
              {lineInfo.section} · {lineInfo.count}
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseLine}
            aria-label="노선 닫기"
            title="노선 닫기"
            className="ml-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {/* 조회 진행 칩 — 자동/수동 재조회가 도는 동안(재검색 버튼과 같은 슬롯). */}
      {loading && (
        <div className="absolute left-1/2 top-3 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md">
          <Loader2 className="size-3.5 animate-spin" />
          주변 역 불러오는 중…
        </div>
      )}
      {showResearch && !loading && (
        <button
          type="button"
          onClick={() => onResearchAt?.({ lat: userView!.lat, lng: userView!.lng })}
          className="absolute left-1/2 top-3 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-md hover:bg-accent"
        >
          <RotateCw className="size-3.5" />
          이 위치에서 재검색
        </button>
      )}
      {/* 따라가기 상태 — 하단 중앙(상단 슬롯과 분리). 추적 중엔 안내 배지 + 종료(X),
          조작으로 끊기면 '다시 따라가기' 칩. */}
      {following && !followPaused && (
        <div className="absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-md">
          <Navigation className="size-3.5 text-primary" />
          {followedDest ? `${followedDest} 열차 따라가는 중` : '열차 따라가는 중'}
          <button
            type="button"
            onClick={handleStopFollow}
            aria-label="따라가기 종료"
            className="-mr-1 ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {following && followPaused && (
        <button
          type="button"
          onClick={handleResumeFollow}
          className="absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-md hover:bg-accent"
        >
          <Navigation className="size-3.5" />
          다시 따라가기
        </button>
      )}
    </div>
  );
};

const Placeholder = ({ children }: { children: React.ReactNode }) => (
  <div className="flex size-full items-center justify-center gap-2 bg-muted/30 p-6 text-sm text-muted-foreground">
    {children}
  </div>
);
