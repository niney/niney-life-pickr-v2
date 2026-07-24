import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type {
  SubwayLineDetailResultType,
  SubwayLineStationItemType,
  SubwayPathResultType,
  SubwayStationGroupItemType,
  SubwayTrainPositionItemType,
} from '@repo/api-contract';
import {
  buildSubwayStationMarkerDataUrl,
  buildSubwayStopDotDataUrl,
  buildSubwayTrainDirDataUrl,
  buildSubwayTrainPillDataUrl,
  createRoutePathIndex,
  locateTrain,
  pointAtRoutePathS,
  roundCoord,
  sliceForMove,
  subwayDestinationLabel,
  subwayLineColor,
  type TrainSection,
} from '@repo/utils';
import type { BridgeMarker, BridgeRouteLine, BridgeVehicle } from './transitMapBridge';
import type { TransitMapHandle } from './useTransitMapSync';
import { useMapResearch } from './useMapResearch';

// 모듈 상수 — 선택×환승 4종을 미리 만들어 모든 마커가 같은 data URL 을 공유
// (OL 아이콘 캐시 1회 디코드). 웹 SubwayStationsMap 과 동일.
const STATION_URL = buildSubwayStationMarkerDataUrl({ selected: false, transfer: false });
const STATION_SELECTED_URL = buildSubwayStationMarkerDataUrl({ selected: true, transfer: false });
const TRANSFER_URL = buildSubwayStationMarkerDataUrl({ selected: false, transfer: true });
const TRANSFER_SELECTED_URL = buildSubwayStationMarkerDataUrl({ selected: true, transfer: true });
// 경로(길찾기) 환승 도트 — 중립 회색 도넛.
const PATH_TRANSFER_DOT_URL = buildSubwayStopDotDataUrl('#6b7280', true);

// 열차 마커 id 접두사 — 역 id 와 충돌 방지.
const VEHICLE_ID_PREFIX = 'train-';
// '지도에서 보기' 대기 마감(ms) — 폴링 1회(30초)+여유.
const PENDING_FOLLOW_MS = 32_000;

// 역 선택 시 확대 포커스 목표 줌 — 웹과 통일(17). 줌아웃은 하지 않는다.
const SUBWAY_SELECT_ZOOM = 17;

// 재검색 트리거 임계 — 역 간격이 버스 정류장보다 넓어 버스(300m)보다 완화한 500m.
const RESEARCH_THRESHOLD_M = 500;
// 자동 재조회 최소 줌 — 역 밀도가 낮아 버스(15)보다 완화한 13.
const AUTO_RESEARCH_MIN_ZOOM = 13;

const EMPTY_MARKERS: BridgeMarker[] = [];
const EMPTY_VEHICLES: BridgeVehicle[] = [];

interface Options {
  // 이 모델이 지도를 소유 중인가 — mode==='subway'. false 면 fit/fly 발화 금지.
  active: boolean;
  mapRef: RefObject<TransitMapHandle | null>;
  groups: SubwayStationGroupItemType[];
  selectedId: string | null;
  // 주변 모드 조회 기준점 — 자동 재조회 판정 + 빈 결과 센터링.
  myLocation?: { lat: number; lng: number } | null;
  onAutoResearchAt?(center: { lat: number; lng: number }): void;
  // 자동 재조회(autoNear)·노선 추적 중 fit 억제 — 사용자가 보던 화면 유지.
  suppressFit?: boolean;
  // 추적 호선 상세(sections) — 폴리라인 + 경유역 점 + 열차 보간 기하.
  lineDetail?: SubwayLineDetailResultType | null;
  // 추적 호선 실시간 열차(30초 폴링).
  positions?: SubwayTrainPositionItemType[];
  // 도착 패널 '지도에서 보기' — 그 열차가 positions 에 나타나면 1회 follow.
  pendingFollow?: { trainNo: string; nonce: number } | null;
  // 경로(길찾기) 모드 — leg 폴리라인 + 출발/도착 핀 + 환승 도트만.
  pathResult?: SubwayPathResultType | null;
}

// 지하철 지도 조립 — 웹 SubwayStationsMap 이식(headless). 마커·폴리라인·열차
// 보간(locateTrain/sliceForMove)·follow 상태머신·fit/flyTo 를 담당하고, 지도
// 오버레이 UI(노선 카드·따라가기 칩)는 화면이 반환 상태로 그린다.
export const useSubwayMapModel = ({
  active,
  mapRef,
  groups,
  selectedId,
  myLocation,
  onAutoResearchAt,
  suppressFit,
  lineDetail,
  positions,
  pendingFollow,
  pathResult,
}: Options) => {
  const lineColor = lineDetail ? subwayLineColor(lineDetail.lineId) : undefined;

  // 자동 재조회/수동 재검색 — 공용 파이프라인(웹 SubwayStationsMap 임계값).
  const { handleViewportChangeEnd, showResearch, researchCenter } = useMapResearch({
    thresholdM: RESEARCH_THRESHOLD_M,
    minZoom: AUTO_RESEARCH_MIN_ZOOM,
    myLocation,
    onAutoResearchAt,
  });

  // ── 열차 따라가기 상태머신(버스 미러 + pendingFollow) ──────────────────────
  const [followId, setFollowId] = useState<string | null>(null);
  const [followPaused, setFollowPaused] = useState(false);
  const [followNotice, setFollowNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushNotice = useCallback((msg: string) => {
    setFollowNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setFollowNotice(null), 4_000);
  }, []);

  // '지도에서 보기' 대기 — 대상이 아직 positions 에 없을 때 무장, 나타나는
  // 폴링에 follow. 타이머는 마감 백스톱 1개뿐.
  const pendingRef = useRef<{ trainNo: string } | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPending = useCallback(() => {
    pendingRef.current = null;
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }, []);
  useEffect(
    () => () => {
      clearPending();
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    [clearPending],
  );

  const handleVehicleSelect = useCallback(
    (id: string) => {
      clearPending();
      setFollowPaused(false);
      setFollowId((prev) => (prev === id ? null : id)); // 같은 열차 재탭 → 해제
    },
    [clearPending],
  );
  const handleFollowInterrupted = useCallback(() => setFollowPaused(true), []);
  const resumeFollow = useCallback(() => setFollowPaused(false), []);
  const stopFollow = useCallback(() => {
    setFollowId(null);
    setFollowPaused(false);
  }, []);
  const followVehicleId = followId && !followPaused ? followId : null;
  const following = followId !== null;

  // 추적 배지 라벨 — 따라가는 열차의 행선지.
  const followedDest = useMemo(() => {
    if (!followId || !positions) return '';
    const t = positions.find((p) => `${VEHICLE_ID_PREFIX}${p.trainNo}` === followId);
    return t ? subwayDestinationLabel(t.destinationName) : '';
  }, [followId, positions]);

  // ── 폴리라인 — 경로 모드면 leg별(호선색), 아니면 추적 호선 sections(지선
  //    개별 줄 + 순환 닫기). 실형상(path)이 있으면 그대로(서버가 순환 링을 닫아
  //    내려줌), 없으면 역 좌표 직선 폴백. 좌표는 5자리 반올림 튜플. ───────────
  const routeLines = useMemo<BridgeRouteLine[] | null>(() => {
    if (!active) return null;
    if (pathResult) {
      if (!pathResult.found) return null;
      return pathResult.legs.map((leg) => ({
        pts: (leg.path ?? leg.stations.map((s) => [s.lat, s.lng] as [number, number])).map(
          ([lat, lng]) => [roundCoord(lat), roundCoord(lng)] as [number, number],
        ),
        color: subwayLineColor(leg.lineId),
      }));
    }
    if (!lineDetail || !lineColor) return null;
    return lineDetail.sections.map((sec) => {
      if (sec.path) {
        return {
          pts: sec.path.map(([lat, lng]) => [roundCoord(lat), roundCoord(lng)] as [number, number]),
          color: lineColor,
        };
      }
      const pts = sec.stations.map(
        (s) => [roundCoord(s.lat), roundCoord(s.lng)] as [number, number],
      );
      if (sec.isLoop && pts.length > 1) pts.push([...pts[0]!] as [number, number]);
      return { pts, color: lineColor };
    });
  }, [active, pathResult, lineDetail, lineColor]);

  // ── 경유역 점 — 추적 호선 stations(중복 stationId 제거). 활성 결과에 같은
  //    역명 그룹이 있으면 생략(이중 마커 방지). ───────────────────────────────
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
  const stopDotUrl = useMemo(
    () => (lineColor ? buildSubwayStopDotDataUrl(lineColor, false) : ''),
    [lineColor],
  );
  const stopDotTransferUrl = useMemo(
    () => (lineColor ? buildSubwayStopDotDataUrl(lineColor, true) : ''),
    [lineColor],
  );

  // ── 마커 조립 — 경로 모드/따라가기/일반 3분기(웹 미러) ─────────────────────
  const markers = useMemo<BridgeMarker[]>(() => {
    if (!active) return EMPTY_MARKERS;
    // 경로 모드 — 출발/도착 핀 + 환승 도트만.
    if (pathResult) {
      if (!pathResult.found || pathResult.legs.length === 0) return EMPTY_MARKERS;
      const legs = pathResult.legs;
      const firstLeg = legs[0]!;
      const lastLeg = legs[legs.length - 1]!;
      const start = firstLeg.stations[0]!;
      const end = lastLeg.stations[lastLeg.stations.length - 1]!;
      const transfers: BridgeMarker[] = legs.slice(1).map((leg) => {
        const s = leg.stations[0]!;
        return {
          id: `xfer-${leg.lineId}-${s.stationId}`,
          lat: s.lat,
          lng: s.lng,
          icon: PATH_TRANSFER_DOT_URL,
        };
      });
      return [
        ...transfers,
        {
          id: 'path-from',
          lat: start.lat,
          lng: start.lng,
          label: start.name,
          icon: STATION_SELECTED_URL,
        },
        {
          id: 'path-to',
          lat: end.lat,
          lng: end.lng,
          label: end.name,
          icon: STATION_SELECTED_URL,
        },
      ];
    }
    // 따라가기 중 — 화면을 비워 열차에 집중(선택 역 하나만).
    if (following) {
      const sel = selectedId ? groups.find((g) => g.id === selectedId) : undefined;
      if (!sel) return EMPTY_MARKERS;
      const transfer = sel.lines.length > 1;
      return [
        {
          id: sel.id,
          lat: sel.lat,
          lng: sel.lng,
          label: sel.name,
          icon: transfer ? TRANSFER_URL : STATION_URL,
          iconSel: transfer ? TRANSFER_SELECTED_URL : STATION_SELECTED_URL,
        },
      ];
    }
    // 경유역 점을 앞에(아래) — 역 마커가 위에 그려지게.
    const stopMarkers: BridgeMarker[] = lineStops.map((s) => ({
      id: s.stationId,
      lat: s.lat,
      lng: s.lng,
      icon: s.isTransfer ? stopDotTransferUrl : stopDotUrl,
    }));
    const stationMarkers: BridgeMarker[] = groups.map((g) => {
      const transfer = g.lines.length > 1;
      return {
        id: g.id,
        lat: g.lat,
        lng: g.lng,
        label: g.name,
        icon: transfer ? TRANSFER_URL : STATION_URL,
        iconSel: transfer ? TRANSFER_SELECTED_URL : STATION_SELECTED_URL,
      };
    });
    return [...stopMarkers, ...stationMarkers];
  }, [
    active,
    groups,
    lineStops,
    stopDotUrl,
    stopDotTransferUrl,
    following,
    selectedId,
    pathResult,
  ]);

  // ── 실시간 열차 — section 별 RoutePathIndex + locateTrain 역간 보간 +
  //    sliceForMove 도로 슬라이스(웹 6차 이식). 실형상(path/stationS)이 있으면
  //    열차가 선로 기하 위를 달리고(anchor 가 역 호길이), 없으면 역 좌표 직선
  //    (순환은 첫 좌표 복제로 닫기) 폴백. ─────────────────────────────────────
  const trainSections = useMemo(() => {
    if (!lineDetail) return null;
    const list: TrainSection[] = [];
    for (const sec of lineDetail.sections) {
      const hasShape =
        sec.path !== undefined &&
        sec.stationS !== undefined &&
        sec.stationS.length === sec.stations.length;
      let pts;
      if (hasShape) {
        pts = sec.path!.map(([lat, lng]) => ({ lat, lng }));
      } else {
        const coords = sec.stations.map((s) => ({ lat: s.lat, lng: s.lng }));
        pts = sec.isLoop && coords.length > 1 ? [...coords, { ...coords[0]! }] : coords;
      }
      const index = createRoutePathIndex(pts);
      if (!index) continue;
      list.push({
        sectionKey: sec.branchKey,
        index,
        isLoop: sec.isLoop,
        byName: new Map(sec.stations.map((s, i) => [s.name, i])),
        stationCount: sec.stations.length,
        ...(hasShape ? { stationS: sec.stationS! } : {}),
      });
    }
    if (list.length === 0) return null;
    return { list, byKey: new Map(list.map((s) => [s.sectionKey, s])) };
  }, [lineDetail]);

  // 폴링 세대별 열차 호길이 스냅샷 — cur/prev(웹 vehPollRef 패턴).
  const vehPollRef = useRef<{
    sections: unknown;
    cur: { v: unknown; s: Map<string, { sectionKey: string; s: number }> } | null;
    prev: Map<string, { sectionKey: string; s: number }> | null;
  }>({ sections: null, cur: null, prev: null });

  const vehicles = useMemo<BridgeVehicle[]>(() => {
    if (!active || !trainSections || !positions || positions.length === 0) {
      vehPollRef.current = { sections: trainSections, cur: null, prev: null };
      return EMPTY_VEHICLES;
    }
    const store = vehPollRef.current;
    if (store.sections !== trainSections) {
      store.sections = trainSections;
      store.cur = null;
      store.prev = null;
    }
    if (store.cur === null || store.cur.v !== positions) {
      store.prev = store.cur === null ? null : store.cur.s;
      store.cur = { v: positions, s: new Map() };
    } else {
      store.cur.s = new Map();
    }
    const prevS = store.prev;
    const curS = store.cur.s;
    const color = lineColor ?? '#6b7280';
    const dirUrl = buildSubwayTrainDirDataUrl(color);
    const out: BridgeVehicle[] = [];
    for (const t of positions) {
      const loc = locateTrain(trainSections.list, {
        statnNm: t.statnNm,
        trainStatus: t.trainStatus,
        updnLine: t.updnLine,
        destinationName: t.destinationName,
      });
      let lat: number;
      let lng: number;
      let via: [number, number][] | undefined;
      let bearingDeg: number | null = null;
      if (loc) {
        const sec = trainSections.byKey.get(loc.sectionKey)!;
        const p = pointAtRoutePathS(sec.index, loc.s);
        lat = p.lat;
        lng = p.lng;
        bearingDeg = loc.bearing;
        curS.set(t.trainNo, { sectionKey: loc.sectionKey, s: loc.s });
        // 같은 section 안에서만 도로 슬라이스 — 지선↔본선 전환은 직선 폴백.
        const prev = prevS?.get(t.trainNo);
        if (prev && prev.sectionKey === loc.sectionKey) {
          via = sliceForMove(sec.index, prev.s, loc.s, { isLoop: sec.isLoop })?.map(
            (w) => [roundCoord(w.lat), roundCoord(w.lng)] as [number, number],
          );
        }
      } else if (t.lat !== null && t.lng !== null) {
        // 노선 순서에 없는 역(형상 밖) — 서버 enrich 좌표로 강등(보간 없음).
        lat = t.lat;
        lng = t.lng;
      } else {
        continue; // 좌표 없음 → 스킵.
      }
      const id = `${VEHICLE_ID_PREFIX}${t.trainNo}`;
      const icon = buildSubwayTrainPillDataUrl({
        label: subwayDestinationLabel(t.destinationName),
        color,
        stopped: t.trainStatus === '1',
        express: t.expressType !== null,
        highlighted: id === followId,
      });
      out.push({ id, lat, lng, icon, via, dirIcon: dirUrl, bearingDeg });
    }
    return out;
  }, [active, trainSections, positions, lineColor, followId]);

  // '지도에서 보기' 요청(nonce) — 이미 지도에 있으면 즉시 follow, 없으면 무장 +
  // 마감 타이머. deps 는 요청만 — 매 폴링 재무장 방지.
  useEffect(() => {
    if (!pendingFollow) return;
    const id = `${VEHICLE_ID_PREFIX}${pendingFollow.trainNo}`;
    if (vehicles.some((v) => v.id === id)) {
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
        pushNotice(
          '열차를 지도에서 찾지 못했습니다. 아직 노선에 진입하지 않았거나 방금 운행을 마쳤을 수 있어요.',
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
    if (vehicles.some((v) => v.id === id)) {
      clearPending();
      setFollowPaused(false);
      setFollowId(id);
    }
  }, [vehicles, clearPending]);

  // 추적 대상이 지도에서 사라지면 해제 — 노선 해제는 조용히, 운행 중 소멸은 안내.
  useEffect(() => {
    if (followId === null) return;
    if (vehicles.some((v) => v.id === followId)) return;
    setFollowId(null);
    setFollowPaused(false);
    if (lineDetail) pushNotice('열차 운행이 종료되어 따라가기를 멈췄어요.');
  }, [vehicles, lineDetail, followId, pushNotice]);

  // ── 노선 정보 카드 — 본선 구간/역 수(웹 lineInfo). ─────────────────────────
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
      `본선 ${main.stations.length}역` +
      (branches.length ? ` · 지선 ${branches.length}` : '');
    return { section, count };
  }, [lineDetail]);

  // ── fit/flyTo — 웹과 동일 시맨틱 ──────────────────────────────────────────
  const activeRef = useRef(active);
  activeRef.current = active;
  const suppressRef = useRef(suppressFit);
  suppressRef.current = suppressFit;
  const myLocationRef = useRef(myLocation);
  myLocationRef.current = myLocation;
  const pathResultRef = useRef(pathResult);
  pathResultRef.current = pathResult;
  useEffect(() => {
    if (!activeRef.current || suppressRef.current || pathResultRef.current) return;
    if (groups.length > 0) {
      mapRef.current?.fitToMarkers();
    } else if (myLocationRef.current) {
      // 주변에 역이 하나도 없을 때 — 최소한 기준점으로 센터링.
      const c = myLocationRef.current;
      mapRef.current?.flyTo(c.lat, c.lng);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  // 경로 로드 시 경로 전체 fit — 결과가 바뀔 때 1회(ref 가드).
  const pathFitRef = useRef<SubwayPathResultType | null>(null);
  useEffect(() => {
    if (!activeRef.current || !pathResult || !pathResult.found) return;
    if (pathFitRef.current === pathResult) return;
    pathFitRef.current = pathResult;
    const coords = pathResult.legs.flatMap((leg) =>
      leg.stations.map((s) => ({ lat: s.lat, lng: s.lng })),
    );
    if (coords.length > 0) mapRef.current?.fitToCoords(coords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathResult]);

  // 선택 역 확대 포커스 — "선택이 바뀐 순간" 1회만(ref 가드). 대상은 활성
  // 그룹 우선, 없으면 경유역 점 — 노선 점 클릭으로 목록에 없는 역을 골라도
  // 지도가 이동한다. 경로 모드는 경로 fit 이 카메라를 쥔다.
  const flownIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (pathResultRef.current) return;
    if (!selectedId) {
      flownIdRef.current = null;
      return;
    }
    if (!activeRef.current || flownIdRef.current === selectedId) return;
    const target =
      groups.find((g) => g.id === selectedId) ??
      lineStops.find((s) => s.stationId === selectedId);
    if (!target) return;
    flownIdRef.current = selectedId;
    mapRef.current?.flyToZoomIn(target.lat, target.lng, SUBWAY_SELECT_ZOOM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, groups, lineStops]);

  return {
    markers,
    routeLines,
    vehicles,
    followVehicleId,
    handleVehicleSelect,
    handleFollowInterrupted,
    handleViewportChangeEnd,
    // 경유역 점 클릭 판별 — 화면의 마커 클릭 라우팅에서 사용.
    stopIds,
    lineInfo,
    follow: {
      following,
      paused: followPaused,
      notice: followNotice,
      dest: followedDest,
      resume: resumeFollow,
      stop: stopFollow,
    },
    research: { show: showResearch, center: researchCenter },
  };
};

export const isSubwayVehicleId = (id: string): boolean => id.startsWith(VEHICLE_ID_PREFIX);
