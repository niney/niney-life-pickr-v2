import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type {
  BusPositionItemType,
  BusRouteStationItemType,
  BusStationItemType,
} from '@repo/api-contract';
import {
  approxDistanceM,
  bearingAtRoutePathS,
  buildBusRouteStopDotDataUrl,
  buildBusStopMarkerDataUrl,
  buildBusVehicleDirDataUrl,
  buildBusVehiclePillDataUrl,
  createRoutePathIndex,
  projectOnRoutePath,
  roundCoord,
  sliceRoutePath,
} from '@repo/utils';
import type { BridgeMarker, BridgeRouteLine, BridgeVehicle } from './transitMapBridge';
import type { TransitMapHandle } from './useTransitMapSync';
import { useMapResearch } from './useMapResearch';

// 모듈 상수 — 모든 정류장 마커가 같은 data URL 을 공유(OL 아이콘 캐시 1회 디코드).
const BUS_MARKER_URL = buildBusStopMarkerDataUrl(false);
const BUS_MARKER_SELECTED_URL = buildBusStopMarkerDataUrl(true);

// 차량 마커 id 접두사 — 정류장 stId 와 네임스페이스 충돌 방지.
const VEHICLE_ID_PREFIX = 'veh-';

// 재검색(수동/자동) 트리거 임계 — 기준점에서 지도 중심이 이만큼 벗어나야.
const RESEARCH_THRESHOLD_M = 300;
// 자동 재조회 최소 줌 — 반경 500m 결과가 화면에 들어오는 수준.
const AUTO_RESEARCH_MIN_ZOOM = 15;
// 같은 이름 정류장 쌍(상·하행 마주보는 표지판)의 라벨 겹침 판정 거리.
const LABEL_DEDUP_DIST_M = 60;

const EMPTY_MARKERS: BridgeMarker[] = [];
const EMPTY_VEHICLES: BridgeVehicle[] = [];

interface Options {
  // 이 모델이 지도를 소유 중인가 — mode==='bus'.
  active: boolean;
  mapRef: RefObject<TransitMapHandle | null>;
  // 지도 표시 정류장(주변 누적 포함 — 호출부의 mapItemsForMap).
  items: BusStationItemType[];
  selectedStId: string | null;
  // 주변 모드 조회 기준점 — 내 위치 마커는 TransitMapView.myLocation 으로
  // 별도 채널이라 여기선 자동 재조회 판정에만 쓴다.
  myLocation?: { lat: number; lng: number } | null;
  onAutoResearchAt?(center: { lat: number; lng: number }): void;
  suppressFit?: boolean;
  // 노선 보기(M7) — 형상 폴리라인 + 경유 정류소 + 실시간 차량.
  routeLine?: { points: { lat: number; lng: number }[]; color: string } | null;
  routeStops?: BusRouteStationItemType[];
  vehicles?: BusPositionItemType[];
  vehicleLabel?: string | null;
  vehicleColor?: string;
}

// 버스 지도 조립 — 웹 BusStationsMap 의 마커 조립(라벨 60m dedup)·자동 재조회
// 스로틀·follow 상태머신·노선 형상 따라가기(sectOrd 윈도우 투영)를 RN 으로
// 이식한 headless 훅. 렌더(WebView 브리지 페이로드)와 UI 상태(재검색 버튼·
// 따라가기 칩)를 반환하고, 지도 오버레이 UI 는 화면이 그린다.
export const useBusMapModel = ({
  active,
  mapRef,
  items,
  selectedStId,
  myLocation,
  onAutoResearchAt,
  suppressFit,
  routeLine,
  routeStops,
  vehicles,
  vehicleLabel,
  vehicleColor,
}: Options) => {
  // ── 따라가기 상태머신(웹 BusStationsMap 미러) ──────────────────────────────
  const [followId, setFollowId] = useState<string | null>(null);
  const [followPaused, setFollowPaused] = useState(false);
  // 운행 종료 안내 — toast 대응(화면이 칩/배너로 렌더, 4초 뒤 자동 소거).
  const [followNotice, setFollowNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushNotice = useCallback((msg: string) => {
    setFollowNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setFollowNotice(null), 4_000);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  const handleVehicleSelect = useCallback((id: string) => {
    setFollowPaused(false);
    setFollowId((prev) => (prev === id ? null : id)); // 같은 버스 재탭 → 해제
  }, []);
  const handleFollowInterrupted = useCallback(() => setFollowPaused(true), []);
  const resumeFollow = useCallback(() => setFollowPaused(false), []);
  const stopFollow = useCallback(() => {
    setFollowId(null);
    setFollowPaused(false);
  }, []);
  const followVehicleId = followId && !followPaused ? followId : null;
  const following = followId !== null;

  // ── 자동 재조회/수동 재검색 — 공용 파이프라인(웹 BusStationsMap 이식) ──────
  const { handleViewportChangeEnd, showResearch, researchCenter } = useMapResearch({
    thresholdM: RESEARCH_THRESHOLD_M,
    minZoom: AUTO_RESEARCH_MIN_ZOOM,
    myLocation,
    onAutoResearchAt,
  });

  // ── 차량 알약 아이콘 — 주행/정차 × 일반/강조 4종 + 방향 다트 ───────────────
  const vehiclePillColor = vehicleColor ?? routeLine?.color ?? '#6b7280';
  const pillUrls = useMemo(
    () => ({
      move: buildBusVehiclePillDataUrl({
        label: vehicleLabel ?? '',
        color: vehiclePillColor,
        stopped: false,
      }),
      stop: buildBusVehiclePillDataUrl({
        label: vehicleLabel ?? '',
        color: vehiclePillColor,
        stopped: true,
      }),
      hiMove: buildBusVehiclePillDataUrl({
        label: vehicleLabel ?? '',
        color: vehiclePillColor,
        stopped: false,
        highlighted: true,
      }),
      hiStop: buildBusVehiclePillDataUrl({
        label: vehicleLabel ?? '',
        color: vehiclePillColor,
        stopped: true,
        highlighted: true,
      }),
      dir: buildBusVehicleDirDataUrl(vehiclePillColor),
    }),
    [vehicleLabel, vehiclePillColor],
  );

  // ── 마커 조립 — 따라가기 중에는 선택 정류장만 남긴다(웹 미러) ──────────────
  const markers = useMemo<BridgeMarker[]>(() => {
    if (!active) return EMPTY_MARKERS;
    if (following) {
      const sel = selectedStId ? items.find((it) => it.stId === selectedStId) : undefined;
      return sel
        ? [
            {
              id: sel.stId,
              lat: sel.lat,
              lng: sel.lng,
              label: sel.name,
              icon: BUS_MARKER_URL,
              iconSel: BUS_MARKER_SELECTED_URL,
            },
          ]
        : [];
    }
    // 같은 이름 + 60m 이내 정류장 그룹은 첫 항목만 라벨 유지 — 마주보는 쌍의
    // 라벨 겹침 방지.
    const labeledByName = new Map<string, BusStationItemType[]>();
    const stationMarkers: BridgeMarker[] = items.map((it) => {
      const peers = labeledByName.get(it.name);
      const nearLabeled =
        peers?.some((p) => approxDistanceM(p, it) <= LABEL_DEDUP_DIST_M) ?? false;
      if (!nearLabeled) {
        if (peers) peers.push(it);
        else labeledByName.set(it.name, [it]);
      }
      return {
        id: it.stId,
        lat: it.lat,
        lng: it.lng,
        label: nearLabeled ? undefined : it.name,
        icon: BUS_MARKER_URL,
        iconSel: BUS_MARKER_SELECTED_URL,
      };
    });
    // 경유 정류소 점 — 활성 마커에 있는 stId 는 제외(정류장 마커 우선). 점을
    // 배열 앞에 둬 정류장 마커가 위에 그려지게 한다(지도는 순서대로 add).
    const activeStIds = new Set(items.map((it) => it.stId));
    const dotUrl = buildBusRouteStopDotDataUrl(routeLine?.color ?? '#6b7280');
    const routeStopMarkers: BridgeMarker[] = (routeStops ?? [])
      .filter((s) => !activeStIds.has(s.stId))
      .map((s) => ({ id: s.stId, lat: s.lat, lng: s.lng, icon: dotUrl }));
    return [...routeStopMarkers, ...stationMarkers];
  }, [active, items, routeStops, routeLine?.color, following, selectedStId]);

  // ── 노선 폴리라인 → 브리지 형식([lat,lng] 5자리) ──────────────────────────
  const routeLines = useMemo<BridgeRouteLine[] | null>(() => {
    if (!active || !routeLine || routeLine.points.length < 2) return null;
    return [
      {
        pts: routeLine.points.map(
          (p) => [roundCoord(p.lat), roundCoord(p.lng)] as [number, number],
        ),
        color: routeLine.color,
      },
    ];
  }, [active, routeLine]);

  // ── 노선 형상 따라가기 — 차량 위치를 형상 호길이(s)로 환산해 폴링 간 이동을
  //    도로 웨이포인트(via)로 넘긴다. sectOrd(구간 순번)×정류소 seq 로 상·하행
  //    왕복 한 줄 형상의 모호성을 푼다(웹 미러). ─────────────────────────────
  const pathIndex = useMemo(
    () => (routeLine ? createRoutePathIndex(routeLine.points) : null),
    [routeLine],
  );
  const stationS = useMemo(() => {
    if (!pathIndex || !routeStops?.length) return null;
    const bySeq = new Map<number, number>();
    let prevS = 0;
    for (const st of [...routeStops].sort((a, b) => a.seq - b.seq)) {
      const proj = projectOnRoutePath(pathIndex, st, Math.max(0, prevS - 30));
      if (proj.distM > 150) continue;
      bySeq.set(st.seq, proj.s);
      prevS = proj.s;
    }
    return bySeq;
  }, [pathIndex, routeStops]);

  // 폴링 세대별 차량 호길이 스냅샷 — cur/prev(웹 vehPollRef 패턴, useMemo 안에서만 갱신).
  const vehPollRef = useRef<{
    path: unknown;
    cur: { v: unknown; s: Map<string, number> } | null;
    prev: Map<string, number> | null;
  }>({ path: null, cur: null, prev: null });

  const bridgeVehicles = useMemo<BridgeVehicle[]>(() => {
    if (!active || !vehicles || vehicles.length === 0) {
      vehPollRef.current = { path: pathIndex, cur: null, prev: null };
      return EMPTY_VEHICLES;
    }
    const store = vehPollRef.current;
    if (store.path !== pathIndex) {
      store.path = pathIndex;
      store.cur = null;
      store.prev = null;
    }
    if (store.cur === null || store.cur.v !== vehicles) {
      store.prev = store.cur === null ? null : store.cur.s;
      store.cur = { v: vehicles, s: new Map() };
    } else {
      store.cur.s = new Map();
    }
    const prevS = store.prev;
    const curS = store.cur.s;
    return vehicles.map((v) => {
      let via: [number, number][] | undefined;
      let sOnPath: number | null = null;
      if (pathIndex && stationS && v.sectOrd !== null) {
        const s0 = stationS.get(v.sectOrd);
        if (s0 !== undefined) {
          const s1 = stationS.get(v.sectOrd + 1) ?? s0 + 2_000;
          const proj = projectOnRoutePath(pathIndex, v, Math.max(0, s0 - 150), s1 + 150);
          if (proj.distM <= 120) {
            sOnPath = proj.s;
            curS.set(v.vehId, proj.s);
            const before = prevS?.get(v.vehId);
            // 전진(s 증가)일 때만 도로 슬라이스 — 후진/데이터 점프는 직선 폴백.
            if (before !== undefined && proj.s > before && proj.s - before <= 2_000) {
              via = sliceRoutePath(pathIndex, before, proj.s)?.map(
                (p) => [roundCoord(p.lat), roundCoord(p.lng)] as [number, number],
              );
            }
          }
        }
      }
      const bearingDeg =
        pathIndex && sOnPath !== null ? bearingAtRoutePathS(pathIndex, sOnPath) : null;
      const id = `${VEHICLE_ID_PREFIX}${v.vehId}`;
      const followed = id === followId;
      const stopped = v.stopFlag === '1';
      const icon = followed
        ? stopped
          ? pillUrls.hiStop
          : pillUrls.hiMove
        : stopped
          ? pillUrls.stop
          : pillUrls.move;
      return { id, lat: v.lat, lng: v.lng, icon, via, dirIcon: pillUrls.dir, bearingDeg };
    });
  }, [active, vehicles, pathIndex, stationS, followId, pillUrls]);

  // 추적 대상이 이번 폴링에 없으면(운행 종료/구간 이탈) 해제 + 안내.
  useEffect(() => {
    if (followId === null) return;
    const vid = followId.slice(VEHICLE_ID_PREFIX.length);
    if (!(vehicles ?? []).some((v) => v.vehId === vid)) {
      setFollowId(null);
      setFollowPaused(false);
      pushNotice('버스 운행이 종료되어 따라가기를 멈췄어요.');
    }
  }, [vehicles, followId, pushNotice]);

  // 노선 해제 시 따라가기도 해제(조용히).
  useEffect(() => {
    if (!routeLine && followId !== null) {
      setFollowId(null);
      setFollowPaused(false);
    }
  }, [routeLine, followId]);

  // ── fit/flyTo — 웹과 동일 시맨틱 ──────────────────────────────────────────
  const activeRef = useRef(active);
  activeRef.current = active;
  const suppressRef = useRef(suppressFit);
  suppressRef.current = suppressFit;
  const myLocationRef = useRef(myLocation);
  myLocationRef.current = myLocation;
  useEffect(() => {
    if (!activeRef.current || suppressRef.current) return;
    if (items.length > 0) {
      mapRef.current?.fitToMarkers();
    } else if (myLocationRef.current) {
      // 주변에 정류장이 하나도 없을 때 — 최소한 기준점으로 센터링.
      const c = myLocationRef.current;
      mapRef.current?.flyTo(c.lat, c.lng);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // 선택 정류장 flyTo — 선택이 바뀐 순간 1회(items 갱신으로 재발사 금지).
  // 선택 시점에 items 에 아직 없으면(즐겨찾기 진입 직후) 도착 후 1회 발사.
  const flownStIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedStId) {
      flownStIdRef.current = null;
      return;
    }
    if (!activeRef.current || flownStIdRef.current === selectedStId) return;
    const target = items.find((it) => it.stId === selectedStId);
    if (!target) return;
    flownStIdRef.current = selectedStId;
    mapRef.current?.flyTo(target.lat, target.lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStId, items]);

  return {
    markers,
    routeLines,
    vehicles: bridgeVehicles,
    followVehicleId,
    handleVehicleSelect,
    handleFollowInterrupted,
    handleViewportChangeEnd,
    follow: {
      following,
      paused: followPaused,
      notice: followNotice,
      resume: resumeFollow,
      stop: stopFollow,
    },
    research: { show: showResearch, center: researchCenter },
  };
};

// 차량/내위치 마커 id 판별 — 화면의 마커 클릭 라우팅에서 사용.
export const isBusVehicleId = (id: string): boolean => id.startsWith(VEHICLE_ID_PREFIX);
