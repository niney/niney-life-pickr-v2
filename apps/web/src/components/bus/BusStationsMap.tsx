import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, Navigation, RotateCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, useMapPublicConfig } from '@repo/shared';
import type {
  BusPositionItemType,
  BusRouteStationItemType,
  BusStationItemType,
} from '@repo/api-contract';
import {
  bearingAtRoutePathS,
  buildBusRouteStopDotDataUrl,
  buildBusStopMarkerDataUrl,
  buildBusVehicleDirDataUrl,
  buildBusVehiclePillDataUrl,
  buildMyLocationMarkerDataUrl,
  createRoutePathIndex,
  projectOnRoutePath,
  sliceRoutePath,
} from '@repo/utils';
import {
  MapCanvas,
  type MapCanvasHandle,
  type MapMarker,
  type MapViewport,
} from '~/components/restaurant/MapCanvas';

// 모듈 레벨 상수 — 모든 마커가 같은 data URL 문자열을 공유해 OL 아이콘
// 캐시가 이미지를 1회만 디코드한다. (차량 알약은 노선번호·색·정차여부에 의존해
// 컴포넌트 안에서 memo 로 생성한다.)
const BUS_MARKER_URL = buildBusStopMarkerDataUrl(false);
const BUS_MARKER_SELECTED_URL = buildBusStopMarkerDataUrl(true);
const MY_LOCATION_MARKER_URL = buildMyLocationMarkerDataUrl();

// 차량 마커 id 접두사 — 정류장 stId 와 네임스페이스 충돌 방지 + 클릭 무시 판별.
const VEHICLE_ID_PREFIX = 'veh-';
// 내 위치 마커 id — 정류장/차량과 충돌 없는 고정 id, 클릭은 무시.
const MY_LOCATION_ID = 'my-location';

interface Props {
  items: BusStationItemType[];
  // 선택 노선의 실시간 버스 위치(15초 폴링) — 없으면 정류장 마커만.
  vehicles?: BusPositionItemType[];
  // 차량 알약에 표기할 노선 번호('141'). vehicles 가 있을 때만 의미 — 도착정보
  // (selectedArrival)에서 오므로 차량이 뜨는 시점엔 항상 확보된다. 없으면 번호
  // 없는 색 알약.
  vehicleLabel?: string | null;
  // 차량 알약 색 — 노선색(폴리라인·경유지 점과 동일 톤). 미지정 시 routeLine
  // 색을 따르고 그마저 없으면 회색 폴백.
  vehicleColor?: string;
  // 주변 모드의 조회 기준점(Geolocation 내 위치 또는 지도 재검색 좌표) —
  // 파란 점 마커. 없으면 미표시.
  myLocation?: { lat: number; lng: number } | null;
  selectedStId: string | null;
  onSelectMarker(stId: string): void;
  // '이 위치에서 재검색' — 주변 모드에서 사용자가 지도를 기준점에서 일정 거리
  // 이상 옮겼을 때(자동 조회 조건 미충족 시) 버튼을 띄우고, 클릭 시 지도 중심
  // 좌표를 넘긴다.
  onResearchAt?(center: { lat: number; lng: number }): void;
  // 자동 재조회 — 줌이 충분히 가까울 때(AUTO_RESEARCH_MIN_ZOOM) 사용자 패닝이
  // 끝나면 지도 중심으로 알아서 조회한다. 서버가 셀 단위 30일 DB 캐시를 들고
  // 있어 업스트림 부담이 거의 없다. 미지정이면 수동 버튼만.
  onAutoResearchAt?(center: { lat: number; lng: number }): void;
  // 자동 재조회로 결과가 갱신될 때 fitToMarkers 억제 — 사용자가 보던 화면을
  // 지도가 되받아치지 않게 한다(명시 액션 시에만 fit).
  suppressFit?: boolean;
  // 주변 조회 진행 중 — 지도 상단에 로딩 칩을 띄워 "조회가 돌고 있음"을
  // 즉시 인지시킨다(마커가 늦게 떠도 미동작으로 오해하지 않게).
  loading?: boolean;
  // 노선 보기 — 추적 중 노선의 형상 폴리라인. MapCanvas 전용 레이어로 넘긴다.
  routeLine?: { points: { lat: number; lng: number }[]; color: string } | null;
  // 노선 보기 — 추적 중 노선의 경유 정류소. 기존 마커 파이프라인에 작은 점으로
  // 합류. 검색/선택 마커와 같은 stId 는 그쪽이 우선(점 생략), 점 클릭은 정류장
  // 선택(stId) 흐름 그대로. 색은 routeLine.color 와 맞춘다.
  routeStops?: BusRouteStationItemType[];
}

// 재검색(수동/자동) 트리거 임계 — 기준점에서 지도 중심이 이만큼 벗어나야.
// 서버 기본 반경(500m)보다 작게 잡아 "결과 경계쯤 왔을 때" 자연히 발동.
const RESEARCH_THRESHOLD_M = 300;
// 자동 재조회 최소 줌 — 반경 500m 결과가 화면에 들어오는 수준. 그보다 멀면
// 자동 조회는 의미가 없어(100건 절단만 남음) 수동 버튼으로 강등.
const AUTO_RESEARCH_MIN_ZOOM = 15;
// 자동 재조회 최소 간격 — 트레일링 예약이라 마지막 이동은 반드시 조회된다.
// 셀 단위 DB 30일 캐시 덕에 대부분 업스트림 없이 서빙돼 짧게 잡아도 안전.
const AUTO_RESEARCH_MIN_INTERVAL_MS = 1_200;

// 같은 이름 정류장 쌍(상·하행 마주보는 표지판)의 라벨 겹침 판정 거리.
const LABEL_DEDUP_DIST_M = 60;

// 등거리 사각 근사 거리(m) — 60m 판정에는 하버사인급 정밀도가 불필요.
const approxDistanceM = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const mPerLatDeg = 111_320;
  const dLat = (a.lat - b.lat) * mPerLatDeg;
  const dLng = (a.lng - b.lng) * mPerLatDeg * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

// 정류장 검색 결과를 vworld 지도에 마커로. 키 로딩/미등록/에러 3분기는
// PublicRestaurantsMap 과 동일 정책 (문구만 버스용).
export const BusStationsMap = ({
  items,
  vehicles,
  vehicleLabel,
  vehicleColor,
  myLocation,
  selectedStId,
  onSelectMarker,
  onResearchAt,
  onAutoResearchAt,
  suppressFit,
  loading,
  routeLine,
  routeStops,
}: Props) => {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  // 키 미등록은 404 — ApiError statusCode 로 분기.
  const keyMissing =
    config.isError && config.error instanceof ApiError && config.error.statusCode === 404;

  const handleRef = useRef<MapCanvasHandle>(null);

  // 따라가기 — 지도에서 버스 알약을 탭하면 그 차량(followId=VehicleMarker.id)을
  // 카메라가 추적한다. paused 는 사용자가 지도를 조작해 추적만 끊긴 상태(토글=
  // followId 는 유지, '다시 따라가기' 칩으로 재개). MapCanvas 에는 paused 아닐
  // 때만 대상을 내려 추적하게 한다.
  const [followId, setFollowId] = useState<string | null>(null);
  const [followPaused, setFollowPaused] = useState(false);
  const handleVehicleSelect = useCallback((id: string) => {
    setFollowPaused(false);
    setFollowId((prev) => (prev === id ? null : id)); // 같은 버스 재탭 → 해제
  }, []);
  const handleFollowInterrupted = useCallback(() => setFollowPaused(true), []);
  // 재개 — followId 는 그대로 두고 paused 만 푼다. MapCanvas 로 내려가는
  // followVehicleId 가 null→id 로 전환되며 재센터링 effect 가 발사된다.
  const handleResumeFollow = useCallback(() => setFollowPaused(false), []);
  const handleStopFollow = useCallback(() => {
    setFollowId(null);
    setFollowPaused(false);
  }, []);
  // paused 아닐 때만 추적 대상을 내린다 — 조작으로 끊기면 null 이 되고, 재개
  // 시 다시 id 로 돌아와 재센터링을 트리거한다.
  const followVehicleId = followId && !followPaused ? followId : null;

  // 사용자가 직접 패닝/줌을 끝낸 시점의 지도 상태 — MapCanvas 가 programmatic
  // move(fit/flyTo)는 걸러주므로(userInteractedRef) 여기엔 사용자 이동만 쌓인다.
  const [userView, setUserView] = useState<{ lat: number; lng: number; zoom: number } | null>(
    null,
  );
  const lastAutoAtRef = useRef(0);
  // 트레일링 예약 타이머 — 스로틀 간격 안에 온 이벤트를 버리지 않고 남은
  // 시간 뒤에 마지막 좌표로 발사한다. 드롭 방식은 "패닝을 멈췄는데 조회가
  // 영영 안 나가는" 간헐 미표시를 만든다.
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
      // 자동 조회 자체는 URL 을 안 건드린다(호출자 정책).
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
        const wait =
          AUTO_RESEARCH_MIN_INTERVAL_MS - (Date.now() - lastAutoAtRef.current);
        if (wait <= 0) fire();
        else autoTimerRef.current = setTimeout(fire, wait);
      }
    },
    [onAutoResearchAt, myLocation],
  );

  // 수동 재검색 버튼 — 기준점에서 임계 이상 벗어났지만 자동 조건이 아닐 때
  // (줌이 멀거나 자동 핸들러 미지정). 재검색 직후엔 기준점=지도 중심(dist≈0)
  // 이라 별도 리셋 없이 숨는다.
  const autoActive =
    !!onAutoResearchAt && userView !== null && userView.zoom >= AUTO_RESEARCH_MIN_ZOOM;
  const showResearch =
    !!onResearchAt &&
    !autoActive &&
    !!myLocation &&
    userView !== null &&
    approxDistanceM(myLocation, userView) > RESEARCH_THRESHOLD_M;

  // 차량 알약 — 노선번호·색은 노선당 고정이고 정차여부(stopFlag)만 2종이라
  // 주행/정차 두 URL 만 생성해 공유한다(OL 아이콘 캐시가 이미지를 1회만 디코드).
  const vehiclePillColor = vehicleColor ?? routeLine?.color ?? '#6b7280';
  const vehicleMoveUrl = useMemo(
    () =>
      buildBusVehiclePillDataUrl({
        label: vehicleLabel ?? '',
        color: vehiclePillColor,
        stopped: false,
      }),
    [vehicleLabel, vehiclePillColor],
  );
  const vehicleStopUrl = useMemo(
    () =>
      buildBusVehiclePillDataUrl({
        label: vehicleLabel ?? '',
        color: vehiclePillColor,
        stopped: true,
      }),
    [vehicleLabel, vehiclePillColor],
  );
  // 진행 방향 화살표 — 노선색 다트. 회전(방위각)은 형상 접선에서 계산해 차량별로.
  const vehicleDirUrl = useMemo(
    () => buildBusVehicleDirDataUrl(vehiclePillColor),
    [vehiclePillColor],
  );
  // 따라가는 버스 강조 알약 — 주행/정차 2종 추가(대상 1대만 사용).
  const vehicleHiMoveUrl = useMemo(
    () =>
      buildBusVehiclePillDataUrl({
        label: vehicleLabel ?? '',
        color: vehiclePillColor,
        stopped: false,
        highlighted: true,
      }),
    [vehicleLabel, vehiclePillColor],
  );
  const vehicleHiStopUrl = useMemo(
    () =>
      buildBusVehiclePillDataUrl({
        label: vehicleLabel ?? '',
        color: vehiclePillColor,
        stopped: true,
        highlighted: true,
      }),
    [vehicleLabel, vehiclePillColor],
  );

  // 따라가기 중에는 화면을 비워 버스에 집중 — 검색 정류장·경유지 점을 숨기고
  // '현재(선택) 정류장' 하나만 남긴다. 폴리라인·차량은 그대로(별도 레이어).
  const following = followId !== null;

  const markers: MapMarker[] = useMemo(() => {
    if (following) {
      const sel = selectedStId ? items.find((it) => it.stId === selectedStId) : undefined;
      return sel
        ? [
            {
              id: sel.stId,
              lat: sel.lat,
              lng: sel.lng,
              label: sel.name,
              icon: { src: BUS_MARKER_URL, selectedSrc: BUS_MARKER_SELECTED_URL },
            },
          ]
        : [];
    }
    // 같은 이름 + 60m 이내 정류장 그룹은 첫 항목만 라벨 유지 — 마주보는
    // 쌍의 라벨이 글자 단위로 겹쳐 읽히지 않는 문제 방지. label 미지정은
    // MapCanvas 가 텍스트 스타일 자체를 생략하는 안전한 경로.
    const labeledByName = new Map<string, BusStationItemType[]>();
    const stationMarkers: MapMarker[] = items.map((it) => {
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
        icon: { src: BUS_MARKER_URL, selectedSrc: BUS_MARKER_SELECTED_URL },
      };
    });
    // 내 위치 마커 — 주변 모드에서만. 라벨 없이 파란 점만.
    const myLocationMarkers: MapMarker[] = myLocation
      ? [
          {
            id: MY_LOCATION_ID,
            lat: myLocation.lat,
            lng: myLocation.lng,
            icon: { src: MY_LOCATION_MARKER_URL, selectedSrc: MY_LOCATION_MARKER_URL },
          },
        ]
      : [];
    // 경유 정류소 점 — 활성 마커(items)에 이미 있는 stId 는 제외(정류장 마커
    // 우선). 라벨 없이 노선색 점만(105개 과밀 방지). 색 없으면 회색 폴백.
    // 점을 배열 앞에 둬 뒤에 오는 정류장/차량 마커가 위에 그려지게 한다.
    const activeStIds = new Set(items.map((it) => it.stId));
    const dotUrl = buildBusRouteStopDotDataUrl(routeLine?.color ?? '#6b7280');
    const routeStopMarkers: MapMarker[] = (routeStops ?? [])
      .filter((s) => !activeStIds.has(s.stId))
      .map((s) => ({
        id: s.stId,
        lat: s.lat,
        lng: s.lng,
        icon: { src: dotUrl, selectedSrc: dotUrl },
      }));
    return [...routeStopMarkers, ...stationMarkers, ...myLocationMarkers];
  }, [items, myLocation, routeStops, routeLine?.color, following, selectedStId]);

  // ── 노선 형상 따라가기 — 차량 위치를 형상 위 호길이(s)로 환산해, 폴링 간
  //    이동을 도로 웨이포인트(via)로 MapCanvas 에 넘긴다. 형상이 상·하행 왕복
  //    한 줄이라 좌표만으로는 두 후보가 생기는데, 차량 sectOrd(구간 순번)와
  //    정류소 seq 가 같은 순번 공간임을 이용해 구간 윈도우로 모호성을 푼다. ──
  const pathIndex = useMemo(
    () => (routeLine ? createRoutePathIndex(routeLine.points) : null),
    [routeLine],
  );
  // 정류소 seq → 호길이. seq 순서대로 '직전 정류소 이후' 윈도우로 단조 투영 —
  // 상·하행에서 같은 자리에 두 번 나타나는 정류소가 올바른 방향 쪽에 붙는다.
  // 형상과 150m 넘게 어긋난 정류소는 스킵(해당 구간은 직선 폴백).
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

  // 폴링 세대별 차량 호길이 스냅샷 — cur 는 이번 vehicles 배열의 s, prev 는
  // 직전 폴링의 s. 같은 vehicles 로 memo 가 재실행돼도(deps 변화·StrictMode
  // 이중 호출) prev 가 밀리지 않아 via 가 일관되게 나온다. accumRef 와 같은
  // '렌더 간 저장소는 useMemo 안에서만 갱신' 패턴.
  const vehPollRef = useRef<{
    path: unknown;
    cur: { v: unknown; s: Map<string, number> } | null;
    prev: Map<string, number> | null;
  }>({ path: null, cur: null, prev: null });

  // 차량은 전용 애니메이션 레이어로 분리 — MapCanvas 가 id(vehId)로 이전/새 위치를
  // 매칭해 via(도로 경유) 또는 직선으로 등속 보간한다. 아이콘은 정차/주행 알약 2종.
  const vehicleItems = useMemo(() => {
    const store = vehPollRef.current;
    // 노선(형상)이 바뀌면 s 공간 자체가 달라진다 — 스냅샷 전부 리셋.
    if (store.path !== pathIndex) {
      store.path = pathIndex;
      store.cur = null;
      store.prev = null;
    }
    // 명시 null 체크 — `store.cur?.v !== vehicles` 는 vehicles 가 undefined 이고
    // cur 가 null 일 때 같다고 판정돼(undefined === undefined) 크래시한다.
    if (store.cur === null || store.cur.v !== vehicles) {
      store.prev = store.cur === null ? null : store.cur.s;
      store.cur = { v: vehicles, s: new Map() };
    } else {
      store.cur.s = new Map(); // 같은 폴링 재계산 — cur 만 다시 채운다.
    }
    const prevS = store.prev;
    const curS = store.cur.s;
    return (vehicles ?? []).map((v) => {
      let via: { lat: number; lng: number }[] | undefined;
      let sOnPath: number | null = null;
      if (pathIndex && stationS && v.sectOrd !== null) {
        const s0 = stationS.get(v.sectOrd);
        if (s0 !== undefined) {
          // 구간 = [정류소 sectOrd, sectOrd+1]. 다음 정류소 s 가 없으면(형상
          // 불일치 스킵/종점) 넉넉한 상한. 마진 ±150m — GPS·형상 오차 흡수.
          const s1 = stationS.get(v.sectOrd + 1) ?? s0 + 2_000;
          const proj = projectOnRoutePath(pathIndex, v, Math.max(0, s0 - 150), s1 + 150);
          if (proj.distM <= 120) {
            sOnPath = proj.s;
            curS.set(v.vehId, proj.s);
            const before = prevS?.get(v.vehId);
            // 전진(s 증가)일 때만 도로 슬라이스 — 후진/왕복 시임 랩/데이터
            // 점프(15초에 2km 초과)는 직선 폴백.
            if (before !== undefined && proj.s > before && proj.s - before <= 2_000) {
              via = sliceRoutePath(pathIndex, before, proj.s);
            }
          }
        }
      }
      // 진행 방위각 — 형상 접선(전진 방향). 정차 중에도 '갈 방향'이 나온다.
      // 형상 투영 실패 시 null — MapCanvas 가 tween 이동 방향으로 폴백.
      const bearingDeg =
        pathIndex && sOnPath !== null ? bearingAtRoutePathS(pathIndex, sOnPath) : null;
      const id = `${VEHICLE_ID_PREFIX}${v.vehId}`;
      // 따라가는 대상만 강조 알약. 나머지는 일반.
      const followed = id === followId;
      const stopped = v.stopFlag === '1';
      const iconSrc = followed
        ? stopped
          ? vehicleHiStopUrl
          : vehicleHiMoveUrl
        : stopped
          ? vehicleStopUrl
          : vehicleMoveUrl;
      return {
        id,
        lat: v.lat,
        lng: v.lng,
        iconSrc,
        via,
        dirIconSrc: vehicleDirUrl,
        bearingDeg,
      };
    });
  }, [
    vehicles,
    pathIndex,
    stationS,
    followId,
    vehicleMoveUrl,
    vehicleStopUrl,
    vehicleHiMoveUrl,
    vehicleHiStopUrl,
    vehicleDirUrl,
  ]);

  // 추적 대상이 이번 폴링에 없으면(운행 종료/구간 이탈) 따라가기 해제 + 안내.
  // 외부(폴링) 이벤트라 effect 가 적합 — vehicles 갱신 시에만 판정한다.
  useEffect(() => {
    if (followId === null) return;
    const vid = followId.slice(VEHICLE_ID_PREFIX.length);
    if (!(vehicles ?? []).some((v) => v.vehId === vid)) {
      setFollowId(null);
      setFollowPaused(false);
      toast.info('버스 운행이 종료되어 따라가기를 멈췄어요.');
    }
  }, [vehicles, followId]);

  // 내 위치 마커 클릭은 no-op — 정류장 선택(stId)으로 오염시키지 않는다. 차량은
  // 전용 레이어라 애초에 클릭이 여기 오지 않지만(markerId 미설정) 방어적으로 무시.
  const handleMarkerSelect = useCallback(
    (id: string) => {
      if (id.startsWith(VEHICLE_ID_PREFIX) || id === MY_LOCATION_ID) return;
      onSelectMarker(id);
    },
    [onSelectMarker],
  );

  // 검색 결과가 갱신되면 전체 마커가 보이게 fit. apiKey 가 늦게 와서 MapCanvas
  // mount 이전에 items 가 먼저 도착한 경우를 위해 apiKey 도 deps 에 포함 —
  // mount 직후 한 번 더 평가된다. (선택 flyTo 효과보다 먼저 선언 — 딥링크로
  // stId 까지 들고 진입하면 fit 후 선택 정류장 센터링이 이긴다.)
  // vehicles 는 deps 에서 의도적으로 제외 — 15초 위치 폴링마다 화면이 널뛰면
  // 안 된다(fit 은 정류장 검색 결과 변경 시에만).
  useEffect(() => {
    if (!apiKey) return;
    // 자동 재조회로 인한 결과 갱신 — 사용자가 보던 화면을 유지(fit 억제).
    if (suppressFit) return;
    if (items.length > 0) {
      // 주변 모드면 기준점 마커도 markers 에 포함돼 함께 fit 된다.
      handleRef.current?.fitToMarkers();
    } else if (myLocation) {
      // 주변에 정류장이 하나도 없을 때 — 최소한 기준점으로 센터링.
      handleRef.current?.flyTo(myLocation.lat, myLocation.lng);
    }
  }, [items, apiKey, myLocation, suppressFit]);

  // 선택 정류장으로 부드럽게 이동 — 리스트 행/마커 클릭 공통.
  // "선택이 바뀐 순간" 1회만 발사한다. items 를 deps 에 두되 이동 트리거로
  // 쓰지 않는 이유: 주변 모드는 자동 조회·폴링으로 items 가 수시로 바뀌는데,
  // 그때마다 재발사하면 사용자가 지도를 옮겨도 선택 정류장으로 계속 끌려간다
  // (실측 재현된 버그). 선택 시점에 items 에 아직 없으면(즐겨찾기 진입 직후
  // 로드 전) flownRef 를 남겨두고 items 도착 후 1회 발사한다.
  const flownStIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedStId) {
      flownStIdRef.current = null;
      return;
    }
    if (!apiKey || flownStIdRef.current === selectedStId) return;
    const target = items.find((it) => it.stId === selectedStId);
    if (!target) return;
    flownStIdRef.current = selectedStId;
    handleRef.current?.flyTo(target.lat, target.lng);
  }, [selectedStId, items, apiKey]);

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
          관리자가 설정 &gt; 지도에서 vworld 키를 등록하면 정류장 지도가 표시됩니다.
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
        markers={markers}
        vehicles={vehicleItems}
        onVehicleSelect={handleVehicleSelect}
        followVehicleId={followVehicleId}
        onFollowInterrupted={handleFollowInterrupted}
        selectedMarkerId={selectedStId}
        onMarkerSelect={handleMarkerSelect}
        onViewportChangeEnd={handleViewportChangeEnd}
        routeLine={routeLine}
      />
      {/* '이 위치에서 재검색' — 지도 상단 중앙 오버레이. 클릭 시 지도 중심으로
          주변 조회를 다시 던진다(자동 조회 금지 — 명시 클릭만). */}
      {/* 조회 진행 칩 — 자동/수동 재조회가 도는 동안. 재검색 버튼과 같은 슬롯
          (버튼은 조회가 시작되면 조건상 숨는 흐름이라 겹치지 않는다). */}
      {loading && (
        <div className="absolute left-1/2 top-3 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md">
          <Loader2 className="size-3.5 animate-spin" />
          주변 정류장 불러오는 중…
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
      {/* 따라가기 상태 — 하단 중앙(상단 loading·재검색 슬롯과 분리). 추적 중엔
          안내 배지 + 종료(X), 조작으로 끊기면 '다시 따라가기' 칩. */}
      {following && !followPaused && (
        <div className="absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-md">
          <Navigation className="size-3.5 text-primary" />
          {vehicleLabel ? `${vehicleLabel}번 따라가는 중` : '버스 따라가는 중'}
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
