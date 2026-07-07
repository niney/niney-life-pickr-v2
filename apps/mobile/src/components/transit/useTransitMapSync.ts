import { useEffect } from 'react';
import type {
  BridgeMarker,
  BridgeRouteLine,
  BridgeVehicle,
  BridgeViewport,
  TransitMapCmd,
} from './transitMapBridge';

// TransitMapView 양 호스트(.native WebView / .web iframe)가 공유하는 컴포넌트
// 계약. 전송(transport)만 호스트가 다르고 props→명령 변환은 useTransitMapSync
// 한 곳에 둔다 — 프로토콜 드리프트 원천 차단.

export interface TransitMapViewProps {
  // 부모가 권한 결정 후 확정한 시작 좌표 — HTML 에 박혀 1회 빌드된다.
  // 이후 변경은 무시(재마운트 금지). 추가 이동은 handle.flyTo 로.
  initialCenter: { lat: number; lng: number; zoom?: number };
  // 화면 focus && AppState active. false 면 WebView 내부 rAF 를 멈춘다.
  active?: boolean;
  markers: BridgeMarker[];
  selectedId?: string | null;
  overlayMarkers?: BridgeMarker[];
  routeLines?: BridgeRouteLine[] | null;
  vehicles?: BridgeVehicle[];
  // 차량 보간 지속(ms) — 폴링 간격보다 살짝 짧게(버스 14s/지하철 28s).
  vehicleTweenMs?: number;
  followVehicleId?: string | null;
  myLocation?: { lat: number; lng: number } | null;
  // 타일 에러 토스트가 시작할 y 픽셀(플로팅 헤더 아래).
  topInset?: number;
  onSelectMarker?(id: string): void;
  onSelectVehicle?(id: string): void;
  onFollowInterrupted?(): void;
  // 사용자 제스처 직후의 moveend 만 — "이 지역 재검색" 트리거.
  onViewportChangeEnd?(vp: BridgeViewport): void;
  // 모든 moveend — 호출자가 현재 영역을 항상 알아야 할 때.
  onViewportSync?(vp: BridgeViewport): void;
}

export interface TransitMapHandle {
  flyTo(lat: number, lng: number, zoom?: number): void;
  flyToZoomIn(lat: number, lng: number, minZoom: number): void;
  fitToMarkers(padding?: number): void;
  fitToCoords(coords: { lat: number; lng: number }[], padding?: number): void;
}

export interface TransitMapSyncState {
  mode: 'light' | 'dark';
  active: boolean;
  markers: BridgeMarker[];
  selectedId: string | null;
  overlayMarkers: BridgeMarker[];
  routeLines: BridgeRouteLine[] | null;
  vehicles: BridgeVehicle[];
  vehicleTweenMs: number;
  followVehicleId: string | null;
  myLocation: { lat: number; lng: number } | null;
}

// props 변경 감시 → 명령 발행. 채널별 독립 effect 라 값이 바뀐 채널만 전송된다.
// ready 가 false→true 로 뒤집히면(초기 로드 / iOS 콘텐츠 프로세스 킬 후 reload)
// 전 effect 가 선언 순서대로 재실행돼 전체 상태가 idempotent 하게 replay 된다
// — 별도 "마지막 상태 보관 ref" 없이 React deps 가 그 역할을 한다.
// send 는 호스트가 useCallback 으로 안정화해서 넘겨야 한다.
export const useTransitMapSync = (
  ready: boolean,
  send: (cmd: TransitMapCmd) => void,
  s: TransitMapSyncState,
): void => {
  // 테마 먼저 — 마커 라벨 색이 darkBg 를 읽으므로 replay 시 선행돼야 한다.
  useEffect(() => {
    if (ready) send({ type: 'setMode', mode: s.mode });
  }, [ready, send, s.mode]);

  useEffect(() => {
    if (ready) send({ type: 'setActive', active: s.active });
  }, [ready, send, s.active]);

  useEffect(() => {
    if (ready) send({ type: 'setMarkers', markers: s.markers });
  }, [ready, send, s.markers]);

  useEffect(() => {
    if (ready) send({ type: 'setSelected', id: s.selectedId });
  }, [ready, send, s.selectedId]);

  useEffect(() => {
    if (ready) send({ type: 'setOverlayMarkers', markers: s.overlayMarkers });
  }, [ready, send, s.overlayMarkers]);

  useEffect(() => {
    if (ready) send({ type: 'setRouteLines', lines: s.routeLines });
  }, [ready, send, s.routeLines]);

  useEffect(() => {
    if (ready) send({ type: 'setMyLocation', coord: s.myLocation });
  }, [ready, send, s.myLocation]);

  useEffect(() => {
    if (ready) send({ type: 'setVehicles', vehicles: s.vehicles, tweenMs: s.vehicleTweenMs });
  }, [ready, send, s.vehicles, s.vehicleTweenMs]);

  // follow 는 차량이 먼저 배치돼 있어야 센터링이 되므로 vehicles 뒤에.
  useEffect(() => {
    if (ready) send({ type: 'setFollow', id: s.followVehicleId });
  }, [ready, send, s.followVehicleId]);
};
