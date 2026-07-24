// 대중교통 지도 RN ↔ WebView(HTML) 브리지 프로토콜.
//
// 전송 방향:
//  - RN → Web: 모든 명령이 window.__cmd(cmd) 단일 진입점의 판별 유니온.
//    native 는 injectJavaScript("window.__cmd(<json>);true;"),
//    web(iframe) 은 contentWindow.postMessage(<json 문자열>) — HTML 안
//    message 리스너가 받아 __cmd 로 위임한다. 식당 지도처럼 __setMarkers 등
//    함수를 여러 개 노출하지 않는다(명령 추가 시 양쪽 전송부 수정 비용 제거).
//  - Web → RN: postMessage(JSON 문자열) 판별 유니온. native 는 onMessage,
//    web 은 window 'message' 리스너로 받는다.
//
// 좌표 규약: [lat, lng] 튜플(폴리라인·via)과 {lat, lng} 객체(단일 점) 혼용 —
// 대량 좌표는 튜플이 페이로드가 작다. 소수 5자리 반올림은 호출자(어댑터) 책임.

// ── 데이터 모양 ──────────────────────────────────────────────────────────────

export interface BridgeMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  // 비선택 아이콘 data URL — RN 이 @repo/utils 빌더로 생성해 넘긴다.
  icon: string;
  // 선택 아이콘 data URL. 지정 시 선택되면 anchor 가 [0.5, 1](핀 꼭지점)로
  // 바뀐다 — markerFrame 규격(비선택 26×26 원 / 선택 32×48 핀) 전제.
  // 미지정이면 선택돼도 icon 그대로(중심 anchor, 경유지 점 등).
  iconSel?: string;
}

export interface BridgeRouteLine {
  // [lat, lng] 튜플 배열. 2점 미만은 무시된다.
  pts: [number, number][];
  // 실선 hex(#rrggbb) — HTML 쪽이 rgba(0.85) 로 변환해 그린다.
  color: string;
}

export interface BridgeVehicle {
  id: string;
  lat: number;
  lng: number;
  // 알약 아이콘 data URL(정차/주행에 따라 호출자가 다른 URL).
  icon: string;
  // 이전 폴링 위치→현재 위치의 도로 경유 웨이포인트([lat,lng]). 있으면 이
  // 경로를 따라 등속 이동, 없으면 직선 보간 폴백. 2점 이상이어야 유효.
  via?: [number, number][];
  // 진행 방향 화살표 아이콘(북쪽 기준 다트 data URL).
  dirIcon?: string;
  // 진행 방위각(도, 북=0 시계방향). null/미지정이면 tween 진행 방향에 의존.
  bearingDeg?: number | null;
}

export interface BridgeBbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface BridgeViewport {
  // 사용자 제스처(패닝/줌) 직후의 moveend 인지 — programmatic 이동과 구분.
  user: boolean;
  center: { lat: number; lng: number };
  zoom: number;
  bbox: BridgeBbox;
}

// ── RN → Web 명령 ────────────────────────────────────────────────────────────

export type TransitMapCmd =
  | { type: 'setMode'; mode: 'light' | 'dark' }
  // false: rAF 취소 + 진행 중 tween 을 목표점으로 스냅(백그라운드 절전).
  | { type: 'setActive'; active: boolean }
  | { type: 'setMarkers'; markers: BridgeMarker[] }
  | { type: 'setSelected'; id: string | null }
  // 겸표시(상대 도메인) 전용 레이어 — fitToMarkers extent 에서 제외.
  | { type: 'setOverlayMarkers'; markers: BridgeMarker[] }
  | { type: 'setRouteLines'; lines: BridgeRouteLine[] | null }
  | { type: 'setVehicles'; vehicles: BridgeVehicle[]; tweenMs: number }
  | { type: 'setFollow'; id: string | null }
  // 바텀시트가 지도 하단을 덮는 높이(CSS px). 따라가기 센터링을 이만큼 위로
  // 보정해 추적 차량이 '보이는 영역' 중앙에 오게 한다(0 = 보정 없음).
  | { type: 'setViewInset'; bottom: number }
  | { type: 'setMyLocation'; coord: { lat: number; lng: number } | null }
  | { type: 'flyTo'; lat: number; lng: number; zoom?: number }
  // 줌아웃 금지 — 현재 줌이 minZoom 보다 크면 유지하고 중심만 이동.
  | { type: 'flyToZoomIn'; lat: number; lng: number; minZoom: number }
  | { type: 'fitToMarkers'; padding?: number }
  | { type: 'fitToCoords'; coords: [number, number][]; padding?: number }
  // 무애니메이션 즉시 복원 — 재마운트 폴백 경로 전용.
  | { type: 'setViewport'; lat: number; lng: number; zoom: number };

// ── Web → RN 이벤트 ──────────────────────────────────────────────────────────

export type TransitMapEvent =
  | { type: 'ready' }
  | { type: 'marker'; id: string }
  | { type: 'vehicle'; id: string }
  | ({ type: 'viewport' } & BridgeViewport)
  // HTML 이 제스처 감지 시 자체적으로 follow 를 즉시 해제한 뒤 발신.
  | { type: 'followInterrupted' }
  | { type: 'tileError'; hasError: boolean }
  // WebView 내부 예외 — 개발 디버깅 채널.
  | { type: 'error'; message: string };

export const parseTransitMapEvent = (raw: unknown): TransitMapEvent | null => {
  let msg: unknown = raw;
  if (typeof raw === 'string') {
    try {
      msg = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!msg || typeof msg !== 'object' || typeof (msg as { type?: unknown }).type !== 'string') {
    return null;
  }
  return msg as TransitMapEvent;
};
