import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import OlMap from 'ol/Map';
import OlView from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import XYZ from 'ol/source/XYZ';
import TileWMS from 'ol/source/TileWMS';
import Feature, { type FeatureLike } from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { fromLonLat, toLonLat } from 'ol/proj';
import type { Coordinate } from 'ol/coordinate';
import { Style, Icon, Text as OlText, Fill, Stroke } from 'ol/style';
import { unByKey } from 'ol/Observable';
import type { EventsKey } from 'ol/events';
import 'ol/ol.css';
import {
  buildRestaurantMarkerDataUrl,
  buildVworldTileUrl,
  type RestaurantCategoryKey,
  type VworldLayer,
} from '@repo/utils';
import { useThemeStore, type ThemeMode } from '~/stores/theme';
import { MapLayerControl } from './MapLayerControl';
import { markerIcon, type IconAnchor } from './mapIconRaster';
import { MARKER_PROP, syncMarkerFeatures } from './mapMarkerSync';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  // 'muted' 는 회색 핀(예: 어드민 발견 페이지의 '이미 등록된 맛집' 표시).
  // 미지정 또는 'primary' 는 기존 빨강. selected 강조는 색 톤만 진해진다.
  variant?: 'primary' | 'muted';
  // primary 변형에서 사용 — 한식/일식 등 카테고리에 맞는 라인 아이콘을 마커
  // 안에 그린다. null/미지정이면 일반 식기 아이콘. muted 에서는 무시.
  categoryKey?: RestaurantCategoryKey | null;
  // 식당 외 마커(버스 정류장 등)용 아이콘 data URL 직접 지정. 지정 시
  // variant/categoryKey 빌더 대신 사용. 비선택/선택 이미지는 식당 마커와
  // 동일 규격(26×26 원 / 32×48 핀)이어야 라벨 offset·축소 스케일이 유효.
  // perMarker: 마커마다 그림이 다른 아이콘(가격·건수를 새긴 배지)이면 true — 사전 래스터화(mapIconRaster)에서
  // 뺀다. 장마다 canvas 를 쥐면 수천 장이 되기 때문. 여러 마커가 같이 쓰는 아이콘은 지정하지 않는다.
  icon?: { src: string; selectedSrc: string; perMarker?: boolean };
  // 줌에 따른 축소(SMALL_ICON_SCALE)·라벨 숨김을 건너뛰고 아이콘을 원본 크기로 그린다 — 크기
  // 자체가 의미인 작은 점(12px)·숫자를 새긴 집계 버블용(일상지도). 선택 시 핀 전환은 동일.
  fixedScale?: boolean;
  // 줌 축소·라벨 기준을 마커마다 — 점이 드문 지도(등산 산)는 덜 줄이고 이름을 일찍 보인다. labelZoom 줌부터
  // 원본 크기 + 라벨(기본 LABEL_VISIBLE_ZOOM), 그 아래는 compactScale 배율(기본 SMALL_ICON_SCALE)·라벨 없음.
  labelZoom?: number;
  compactScale?: number;
  // 같은 레이어 안에서 그리는 순서 — 클수록 위(선택 마커는 1000). 기본 0.
  zIndex?: number;
}

// 실시간 차량 마커 — 정류장 마커(MapMarker)와 분리된 전용 레이어. 선택·라벨
// 개념이 없고, 위치가 폴링으로 갱신되면 이전 표시 위치에서 새 위치로 보간된다.
export interface VehicleMarker {
  // 차량 식별자(vehId 기반). 폴링 간 이전/새 위치 매칭 키.
  id: string;
  lat: number;
  lng: number;
  // OL Icon.src 로 그대로 쓰는 아이콘 data URL(알약). 정차/주행에 따라 호출자가
  // 다른 URL 을 넘긴다. anchor 는 [0.5, 0.5](이미지 중앙) 고정.
  iconSrc: string;
  // 노선 형상 따라가기 — 이전 위치→현재 위치의 도로 경유 웨이포인트(호출자가
  // 노선 폴리라인에서 잘라 넘김). 있으면 이 경로를 따라 등속 이동하고 마지막
  // 점(도로 투영점)에 멈춘다. 없으면 직선 보간 폴백. 점 2개 이상이어야 유효.
  via?: { lat: number; lng: number }[];
  // 진행 방향 화살표 아이콘(북쪽 기준 다트 data URL) — 지정 시 마커 좌표에
  // 회전 화살표를 함께 그린다. 회전은 bearingDeg(호출자가 노선 접선으로 계산)
  // 또는 tween 진행 방향에서 얻고, 둘 다 없으면 화살표를 그리지 않는다.
  dirIconSrc?: string;
  // 진행 방위각(도, 북=0 시계방향). null/미지정이면 tween 방향에만 의존.
  bearingDeg?: number | null;
}

// ── 차량 tween 웨이포인트 소기하 — EPSG:3857 평면 좌표 전용 ──────────────────
type XY = [number, number];

const buildCumLengths = (pts: XY[]): number[] => {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  }
  return cum;
};

// 호길이 s 지점 좌표 — 웨이포인트가 십수 개 수준이라 선형 탐색으로 충분.
const samplePathAt = (pts: XY[], cum: number[], s: number): XY => {
  if (s <= 0) return pts[0]!;
  const total = cum[cum.length - 1]!;
  if (s >= total) return pts[pts.length - 1]!;
  let i = 1;
  while (cum[i]! < s) i++;
  const segLen = cum[i]! - cum[i - 1]!;
  const t = segLen > 0 ? (s - cum[i - 1]!) / segLen : 0;
  return [
    pts[i - 1]![0] + (pts[i]![0] - pts[i - 1]![0]) * t,
    pts[i - 1]![1] + (pts[i]![1] - pts[i - 1]![1]) * t,
  ];
};

// 호길이 s 지점의 진행 방향(라디안, 위쪽=0 시계방향) — OL Icon.rotation 과 같은
// 규약(3857 에서 +y=북, +x=동 → atan2(dx, dy)). 중복점 세그먼트는 앞으로 넘어가
// 탐색, 방향을 못 찾으면 null.
const pathDirectionAt = (pts: XY[], cum: number[], s: number): number | null => {
  const total = cum[cum.length - 1]!;
  const sc = Math.min(Math.max(s, 0), total);
  let i = 1;
  while (i < cum.length - 1 && cum[i]! < sc) i++;
  for (; i < pts.length; i++) {
    const dx = pts[i]![0] - pts[i - 1]![0];
    const dy = pts[i]![1] - pts[i - 1]![1];
    if (dx !== 0 || dy !== 0) return Math.atan2(dx, dy);
  }
  return null;
};

// p 의 경로 최근접 호길이 — 새 tween 이 현재 표시 좌표에서 이어지게 하는 투영.
// 반환 dist 는 경로 이탈 판정용(3857 단위 ≈ m, 위도 배율 차이는 판정에 무해).
const projectPathS = (pts: XY[], cum: number[], p: XY): { s: number; dist: number } => {
  let bestS = 0;
  let bestD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i]![0];
    const ay = pts[i]![1];
    const dx = pts[i + 1]![0] - ax;
    const dy = pts[i + 1]![1] - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2)) : 0;
    const d = Math.hypot(p[0] - (ax + dx * t), p[1] - (ay + dy * t));
    if (d < bestD) {
      bestD = d;
      bestS = cum[i]! + Math.sqrt(len2) * t;
    }
  }
  return { s: bestS, dist: bestD };
};

// 차량 한 대의 진행 중 tween — 웨이포인트(pts)와 누적 길이(cum) 위를 s0 에서 끝까지 dur 동안.
interface VehicleAnim {
  pts: XY[];
  cum: number[];
  s0: number;
  start: number;
  dur: number;
}

// 차량 좌표를 다시 쓰는 최소 간격(ms). 좌표를 바꾸면 소스 change → 타일·노선·정류장까지 지도 전체
// 재그리기가 따라오는데, tween 은 폴링 주기 대부분(버스 14초/15초) 동안 돈다. 버스 5m/s 는 z15 에서
// 프레임당 0.02px 라 매 프레임 다시 그릴 이유가 없다 — 화면에서 가장 빠른 차량이 VEHICLE_STEP_PX 만큼
// 움직일 시간만큼 건너뛴다(확대하면 해상도가 작아져 자동으로 촘촘해진다).
const VEHICLE_STEP_PX = 0.5;
const VEHICLE_APPLY_MIN_MS = 16;
const VEHICLE_APPLY_MAX_MS = 250;
const vehicleApplyIntervalMs = (
  anims: ReadonlyMap<string, VehicleAnim>,
  resolution: number | undefined,
): number => {
  if (!resolution || resolution <= 0) return VEHICLE_APPLY_MIN_MS;
  let maxSpeed = 0; // 지도 단위(≈m)/ms
  for (const a of anims.values()) {
    const speed = a.dur > 0 ? (a.cum[a.cum.length - 1]! - a.s0) / a.dur : 0;
    if (speed > maxSpeed) maxSpeed = speed;
  }
  if (maxSpeed <= 0) return VEHICLE_APPLY_MAX_MS;
  return Math.min(
    VEHICLE_APPLY_MAX_MS,
    Math.max(VEHICLE_APPLY_MIN_MS, (VEHICLE_STEP_PX * resolution) / maxSpeed),
  );
};

// 면(폴리곤) 오버레이 — 시군구 경계 choropleth 처럼 "배경" 으로 까는 면들. 호출자가 GeoJSON 을
// EPSG:3857 로 읽어 캐시한 OL Feature 를 넘기고, 여기서는 clone 해 전용 소스(맨 아래 레이어)에 붙인다
// (원본 feature 에 style 을 박지 않고, 같은 feature 가 두 소스에 동시에 들어가는 사고도 막는다).
// styleOf 가 null 이면 그 면은 그리지 않는다(데이터 없는 곳). 클릭은 마커·차량이 안 맞았을 때만
// onAreaSelect(keyOf(feature)) — 마커가 항상 우선.
export interface MapAreas {
  features: readonly Feature[];
  keyOf(feature: Feature): string;
  styleOf(feature: Feature): Style | null;
}

export interface WmsOverlay {
  url: string;
  params: Record<string, string>;
  // 요청 좌표계 이름(브이월드는 EPSG:3857 이 불안정해 같은 좌표인 EPSG:900913).
  projection?: string;
  minZoom?: number;
  opacity?: number;
}

export interface MapViewport {
  // longitude/latitude (EPSG:4326). bbox 도 같이 — 호출자가 뷰포트 검색에
  // 그대로 박아 쓰기 좋게.
  centerLng: number;
  centerLat: number;
  zoom: number;
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number };
}

export interface MapCanvasHandle {
  // 외부에서 특정 좌표로 부드럽게 이동. 다중 마커 페이지에서 카드 클릭 시
  // 해당 마커로 fly-to 할 때 사용.
  // opts.bottomInset: 아래쪽을 덮는 높이(px, 모바일 바텀시트) — 그만큼 중심을 남쪽으로 밀어 지점이
  // 보이는 영역의 세로 가운데에 오게 한다.
  flyTo(lat: number, lng: number, zoom?: number, opts?: { bottomInset?: number }): void;
  // flyTo 와 같지만 최소 minZoom 까지 확대 — 이미 더 확대돼 있으면 줌은 유지하고
  // 중심만 옮긴다. 카드 더블클릭 "확대" 에 사용 (줌아웃은 하지 않음).
  flyToZoomIn(lat: number, lng: number, minZoom: number, opts?: { bottomInset?: number }): void;
  // bbox 에 모든 마커가 들어오게 fit. ol fit duration 짧게.
  fitToMarkers(padding?: number): void;
  // 임의 좌표 집합의 bbox 에 맞춰 fit — 마커가 아닌 경로(길찾기 폴리라인) 전체가
  // 보이게 할 때. 마커 소스와 무관하게 넘겨받은 좌표만으로 extent 를 만든다.
  // opts.bottomInset: 아래쪽을 덮는 높이(px, 모바일 바텀시트) — 그만큼 아래 여백을 더해 시트 위에 들어오게.
  fitToCoords(coords: { lat: number; lng: number }[], padding?: number, opts?: { bottomInset?: number }): void;
}

interface Props {
  apiKey: string;
  markers: MapMarker[];
  selectedMarkerId?: string | null;
  initialCenter?: { lat: number; lng: number; zoom?: number };
  onMarkerSelect?(markerId: string): void;
  // 사용자가 패닝/줌을 끝낸 후 (programmatic move 는 무시) 호출. "이 지역 재검
  // 색" 버튼 노출 트리거에 쓴다.
  onViewportChangeEnd?(viewport: MapViewport): void;
  // 모든 viewport 변경(첫 렌더, programmatic move, 사용자 인터랙션) 시 호출.
  // 호출자가 "현재 보이는 영역" 을 항상 알고 있어야 할 때 (예: 검색 시점에
  // bbox 자동 첨부) 사용. onViewportChangeEnd 와는 의도가 다름 — 그쪽은
  // 사용자 인터랙션 직후의 명시적 시그널, 이쪽은 단순 동기화 채널.
  onViewportSync?(viewport: MapViewport): void;
  // 타일 로딩 상태 변화 알림. hasError=true 는 "키 거부 의심"(짧은 시간에
  // 여러 타일이 연속 실패), false 는 "회복"(이후 타일이 성공적으로 로드됨).
  // 단발 실패(패닝 중 요청 취소, vworld 순간 throttling 등)는 호출되지 않는다.
  onTileError?(hasError: boolean): void;
  // 좌하단 레이어 전환 컨트롤(일반/다크/위성) 표시. 기본 true.
  layerControl?: boolean;
  // 노선 형상 폴리라인 — 마커 레이어보다 아래 전용 VectorLayer 에 그린다(마커를
  // 가리지 않음). null/미지정이면 미표시. fit/flyTo 대상에서 제외(별도 소스라
  // fitToMarkers 의 마커 extent 에 포함되지 않는다). 단일 객체(버스 노선) 또는 배열
  // (지하철 지선처럼 이어지지 않는 여러 폴리라인 — 하나로 이으면 지그재그) 모두 허용.
  routeLine?:
    | { points: { lat: number; lng: number }[]; color: string }
    | { points: { lat: number; lng: number }[]; color: string }[]
    | null;
  // WMS 덮개 — 배경 타일 바로 위·벡터 레이어 아래(브이월드 2D데이터 등산로 선 등, 등산 7차). minZoom 아래에선 그리지 않는다.
  // 브이월드 2D데이터·WMS 는 Referer 로 등록 도메인을 확인한다(브라우저가 페이지 주소를 보낸다). null/미지정이면 없음.
  wmsOverlay?: WmsOverlay | null;
  // 면 오버레이(MapAreas) — 모든 벡터 레이어 아래 전용 VectorLayer. areas 가 바뀔 때만 다시 그린다.
  // null/미지정이면 빈 레이어. fit 대상에서 제외.
  areas?: MapAreas | null;
  // 면 클릭 — 마커·차량 히트가 없을 때만. 넘겨지는 key 는 areas.keyOf 결과.
  onAreaSelect?(key: string): void;
  // 겸표시(보조) 마커 — 자기 도메인 마커(markers) 아래 전용 VectorLayer 에 그린다.
  // markers 와 달리 fitToMarkers/fit extent 에서 제외(별도 소스)돼 겸표시가 화면을
  // 넓히지 않는다. 클릭은 markerId 로 잡혀 onMarkerSelect 로 전달(호출자가 id prefix
  // 로 자기/상대 도메인 구분). 라벨은 호출자가 label 을 안 넘겨 생략. 미지정/빈
  // 배열이면 빈 레이어 — 식당·어드민 지도는 미지정이라 기존 동작과 완전 동일.
  overlayMarkers?: MapMarker[];
  // 실시간 차량 마커 — 정류장 마커(markers) 위 전용 레이어. 폴링으로 위치가
  // 통째로 바뀌면 id 로 이전/새 위치를 매칭해 직선 등속 보간(rAF)한다. 클릭은
  // 무시(markerId 미설정 → 아래 정류장으로 통과). 미지정/빈 배열이면 미표시.
  vehicles?: VehicleMarker[];
  // 차량 보간 지속(ms). 폴링 간격보다 살짝 짧게 잡아 도착 후 잠깐 멈췄다 다음
  // 위치로 이어진다(등속). 데이터가 늦으면 목표점에서 대기. 기본 14초(15초 폴링).
  vehicleTweenMs?: number;
  // 차량 마커 클릭 — 정류장(onMarkerSelect)과 분리된 채널. 넘겨진 id 는
  // VehicleMarker.id 그대로. 미지정이면 차량 클릭은 무시된다.
  onVehicleSelect?(vehicleId: string): void;
  // 따라가기 대상 차량 id(VehicleMarker.id). 지정되면 그 차량이 이동할 때 매
  // 프레임 지도 중심을 차량 위치로 옮긴다(카메라 추적). null/미지정이면 추적
  // 안 함. 값이 새로 지정되는 순간 한 번 부드럽게 센터링한다.
  followVehicleId?: string | null;
  // 추적 중 사용자가 지도를 드래그/휠하면 1회 호출 — 카메라 추적을 그 즉시
  // 멈춘다(호출자가 '일시정지' 상태로 전환해 재개 UI 를 띄우는 용도). 토글
  // 자체는 호출자가 관리한다.
  onFollowInterrupted?(): void;
  // 지정 시 이 키로 OL Map 인스턴스를 모듈 풀에 보관/재사용한다(탭 전환 플래시
  // 제거). 마운트 수명 동안 불변으로 간주 — 값이 바뀌어도 재획득하지 않는다.
  // 미지정이면 풀링 없이 기존 동작(언마운트 시 GC)과 완전히 동일. 같은 키를
  // 동시에 두 MapCanvas 가 쓰면 안 된다(대중교통 탭은 한 번에 하나만 마운트).
  poolKey?: string;
  className?: string;
}

const DEFAULT_ZOOM = 15;
// 겸표시 미지정일 때의 빈 배열 — 매 렌더 새 [] 를 만들지 않는다.
const EMPTY_MARKERS: readonly MapMarker[] = [];

// 아래쪽 inset(px — 예: 바텀시트가 덮는 높이)만큼 지도 중심을 남쪽으로 밀어, 목표 지점이 "보이는
// 영역" 의 세로 가운데에 오게 한다. inset 이 없으면 그대로. (지도 중심 = 뷰포트 중심이라 inset/2 만큼.)
const centerWithBottomInset = (
  view: OlView,
  center: Coordinate,
  zoom: number,
  bottomInset?: number,
): Coordinate => {
  if (!bottomInset || bottomInset <= 0) return center;
  const res = view.getResolutionForZoom(zoom);
  return [center[0]!, center[1]! - (bottomInset / 2) * res];
};

// 노선 폴리라인 색 — 실선 hex(#rrggbb)를 살짝 투명한 rgba 로. 반투명이라 아래
// 도로/지명이 비쳐 노선이 지도를 뭉개지 않는다. busRouteTypeColor 는 항상 6자리
// hex 를 반환하므로 파싱은 단순.
const strokeColorWithAlpha = (hex: string, alpha: number): string => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// 앱 테마 → 지도 기본 레이어. 라이트=일반(Base), 다크=야간(midnight).
const layerForTheme = (mode: ThemeMode): VworldLayer =>
  mode === 'dark' ? 'midnight' : 'Base';

// 어두운 배경 레이어 — 마커 라벨 색을 반전(흰 글자 + 어두운 외곽선)해야 한다.
const isDarkBaseLayer = (layer: VworldLayer): boolean =>
  layer === 'midnight' || layer === 'Satellite';

// 이 줌 이상부터 라벨(식당명) + 풀사이즈 핀. 미만에서는 라벨 없는 축소 핀.
// OL declutter 가 feature 단위라 라벨까지 같이 그리면 줌 아웃 시 핀이 통째로
// 가려진다 — 라벨 영역을 떼서 충돌 박스를 작게 만드는 게 핵심.
const LABEL_VISIBLE_ZOOM = 14;
// LABEL_VISIBLE_ZOOM 미만에서 아이콘 축소 배율. 26×26 → ~14px. 작아질수록
// 도심 밀집 지역에서도 핀 충돌 거의 없음.
const SMALL_ICON_SCALE = 0.55;
// 아이콘 기준점 — 비선택(원·점·배지)은 그림 중앙, 선택(핀·꼬리 배지)은 아래 꼭지점.
const CENTER_ANCHOR: IconAnchor = [0.5, 0.5];
const PIN_ANCHOR: IconAnchor = [0.5, 1];
// 마커 Style 캐시(makeMarkerStyle 참조) — 같은 입력이면 같은 인스턴스를 재사용.
const markerStyleCache = new Map<string, Style>();
const MARKER_STYLE_CACHE_MAX = 6000;
// 아이콘 data URL → 짧은 번호. 캐시 키에 data URL(장당 0.5~1.5KB)을 그대로 이어 붙이면 style function 이
// 불릴 때마다 긴 문자열을 새로 만들고 해시한다(6,000개에 12ms 실측). 같은 문자열 인스턴스로 다시 조회하면
// 엔진이 해시를 재사용하므로 번호 조회는 사실상 상수 시간이다. 캐시를 비울 때 같이 비운다.
const iconSrcIds = new Map<string, number>();
const iconSrcId = (src: string | undefined): number => {
  if (!src) return 0;
  let id = iconSrcIds.get(src);
  if (id === undefined) {
    id = iconSrcIds.size + 1;
    iconSrcIds.set(src, id);
  }
  return id;
};

// ── 지도 인스턴스 풀 ─────────────────────────────────────────────────────────
// 탭 전환(버스↔지하철)은 라우트 언마운트라 지도가 매번 재생성 → 타일 재로드
// 플래시가 생긴다. poolKey 를 준 MapCanvas 는 언마운트 시 OL Map 을 파괴하지
// 않고 여기 보관했다가, 다음 마운트가 setTarget 으로 이어받는다. 타일 캐시·
// 뷰포트가 통째로 살아남아 플래시가 사라진다. poolKey 미지정(식당·어드민 지도)
// 은 이 풀에 손대지 않고 기존처럼 GC — 공용 컴포넌트 회귀를 원천 차단한다.
// transitMapViewport(A안)와는 보완 관계: 새로고침/직접 진입으로 풀이 비었을
// 때는 그쪽 저장값이 initialCenter 로 뷰포트를 복원한다.
interface PooledMap {
  map: OlMap;
  tileSource: XYZ;
  // 타일 URL 이 apiKey 를 포함 — 재사용 시 불일치면 폐기하고 신규 생성.
  apiKey: string;
  // 마지막 레이어 선택(일반/야간/위성). 재사용 마운트가 이 값으로 layer state 를
  // 초기화해야 setUrl 없이 이어받아 플래시가 재발하지 않는다.
  layer: VworldLayer;
  // 사용자가 토글로 직접 골랐는지 — 재사용 시 테마 기본값으로 되돌아가지 않게.
  userPickedLayer: boolean;
}
const mapPool = new Map<string, PooledMap>();
// 풀 상한 — 지도마다 OL Map 과 타일 캐시(기본 512장)가 딸려 있어, 들른 지도 페이지를 전부 쥐고 있으면
// 탭을 닫을 때까지 메모리가 쌓인다(키 7종). 최근에 쓴 것만 남기고 가장 오래된 것부터 dispose 한다.
// Map 은 삽입 순서를 지키고 take 는 delete, 반납은 set 이라 첫 키가 가장 오래된 것이다.
const MAP_POOL_MAX = 3;
const releaseToPool = (key: string, entry: PooledMap): void => {
  mapPool.set(key, entry);
  while (mapPool.size > MAP_POOL_MAX) {
    const oldest = mapPool.keys().next().value;
    if (oldest === undefined) break;
    mapPool.get(oldest)?.map.dispose();
    mapPool.delete(oldest);
  }
};

// vworld WMTS 타일을 OpenLayers 가 직접 받아 그리는 저레벨 캔버스. 단일/다중
// 마커 모두 처리 — 마커 배열만 넘겨주면 된다. 좌표 없는 상태 / 키 없는 상태
// 등 렌더 분기는 호출자 책임 (placeholder 포함).
//
// 마커 스타일:
//   - 일반: 빨간 핀 (32x48 SVG)
//   - 선택됨: 더 큰 핀 + 강조 색
//
// 인터랙션:
//   - 마커 클릭 → onMarkerSelect
//   - 사용자 패닝/줌 종료 → onViewportChangeEnd (첫 렌더 트리거 방지 플래그)
export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(
  {
    apiKey,
    markers,
    selectedMarkerId,
    initialCenter,
    onMarkerSelect,
    onViewportChangeEnd,
    onViewportSync,
    onTileError,
    layerControl = true,
    routeLine,
    wmsOverlay,
    areas,
    onAreaSelect,
    overlayMarkers,
    vehicles,
    vehicleTweenMs = 14_000,
    onVehicleSelect,
    followVehicleId,
    onFollowInterrupted,
    poolKey,
    className,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<OlMap | null>(null);
  const vectorSourceRef = useRef<VectorSource | null>(null);
  // 노선 형상 전용 소스 — 마커 소스와 분리해 fitToMarkers 가 54km 노선까지
  // 끌어안아 줌아웃되는 것을 막는다.
  const routeLineSourceRef = useRef<VectorSource | null>(null);
  // 면 오버레이 전용 소스 — 맨 아래 레이어, fit extent 제외.
  const areaSourceRef = useRef<VectorSource | null>(null);
  // 겸표시(보조) 마커 전용 소스 — 마커 소스와 분리해 fit extent 에서 제외한다.
  const overlayMarkerSourceRef = useRef<VectorSource | null>(null);
  // 차량 전용 소스/보간 상태 — 정류장 마커 파이프라인(선언적 재생성)과 분리해
  // feature 를 재사용하고 geometry 만 rAF 로 갱신한다(프레임 단위 clear 금지).
  const vehicleSourceRef = useRef<VectorSource | null>(null);
  const wmsLayerRef = useRef<TileLayer<TileWMS> | null>(null);
  const vehicleFeaturesRef = useRef(new Map<string, Feature>());
  const vehicleAnimRef = useRef(new Map<string, VehicleAnim>());
  const vehicleRafRef = useRef<number | null>(null);
  // 차량 좌표를 마지막으로 다시 쓴 시각 — tick 이 vehicleApplyIntervalMs 만큼 건너뛰는 기준.
  const vehicleLastApplyRef = useRef(0);
  // 방향 화살표 — 알약 feature 와 Point geometry 를 공유해(이동 자동 동기)
  // 회전만 Icon 인스턴스를 직접 돌린다. src 는 재생성 판별용.
  const vehicleArrowsRef = useRef(
    new Map<string, { feature: Feature; icon: Icon; src: string }>(),
  );
  // 따라가기 대상 차량 id — rAF tick 이 매 프레임 이 차량 좌표로 지도 중심을
  // 옮긴다. 사용자 드래그/휠 시 즉시 null 로 지워 추적을 끊는다(prop 은 곧
  // 호출자가 일시정지로 내려 동기화). prop 을 stale 없이 읽는 미러 ref.
  const followIdRef = useRef<string | null | undefined>(followVehicleId);
  // 현재 베이스 타일 소스 — 레이어 변경 시 map 을 재생성하지 않고 URL 만 교체한다
  // (줌/센터/마커 유지).
  const tileSourceRef = useRef<XYZ | null>(null);

  // 레이어(일반/다크/위성). 초기값은 앱 테마를 따른다. 사용자가 토글로 한 번
  // 직접 고르면(userPickedLayerRef) 이후 테마 변경에 끌려가지 않는다.
  const themeMode = useThemeStore((s) => s.mode);
  // 풀에 보관된 Map 이 있으면 그 레이어 선택을 이어받아 초기화한다 — 재사용 첫
  // 렌더에서 layer state 가 테마 기본값으로 튀면 layer effect 가 setUrl 로 타일을
  // 통째로 리프레시해 플래시가 재발한다. 여기선 peek(get)만 — 실제 take(delete)
  // 는 map 생성 effect 에서(readTransitViewport 초기화와 같은 관례). 마운트 수명
  // 동안 poolKey 는 불변이라 이 peek 는 초기값 계산에만 쓰인다.
  const pooledInit = poolKey ? mapPool.get(poolKey) : undefined;
  const [layer, setLayer] = useState<VworldLayer>(
    () => pooledInit?.layer ?? layerForTheme(themeMode),
  );
  const userPickedLayerRef = useRef(pooledInit?.userPickedLayer ?? false);
  // map 생성 effect 가 최신 layer 값을 stale closure 없이 읽도록 ref 동기화.
  const layerRef = useRef(layer);
  layerRef.current = layer;
  // 라벨 style function 이 평가 시점에 읽는 다크 배경 여부.
  const isDarkBaseRef = useRef(isDarkBaseLayer(layer));

  // 테마가 바뀌면(사용자가 레이어를 직접 고르지 않은 한) 지도도 따라간다.
  useEffect(() => {
    if (userPickedLayerRef.current) return;
    setLayer(layerForTheme(themeMode));
  }, [themeMode]);

  const handlePickLayer = useCallback((next: VworldLayer) => {
    userPickedLayerRef.current = true;
    setLayer(next);
  }, []);
  // 선택 마커 id 를 ref 로 보관 — 각 feature 의 style function 이 평가 시점에 이
  // 값을 읽어 강조를 결정한다. selectedMarkerId 가 바뀌어도 feature 를 재생성하지
  // 않고, 영향받는 이전/현재 2개 feature 만 changed() 로 다시 칠한다.
  const selectedIdRef = useRef(selectedMarkerId);
  const prevSelectedIdRef = useRef(selectedMarkerId);
  const featureByIdRef = useRef(new Map<string, Feature>());
  // 겸표시 마커의 id → feature 색인, 그리고 두 색인이 어느 소스 기준인지(소스가 새로 만들어지면 버린다).
  const overlayByIdRef = useRef(new Map<string, Feature>());
  const markerSyncSourceRef = useRef<VectorSource | null>(null);
  const overlaySyncSourceRef = useRef<VectorSource | null>(null);
  // 사용자 인터랙션이 시작된 적 있는지. 처음 렌더 직후 발생하는 자동 moveend
  // 이벤트(setCenter/animate 호출) 는 무시하기 위함.
  const userInteractedRef = useRef(false);
  // 콜백 ref — useEffect 가 매번 새 effect 를 생성하지 않도록 ref 로 보관.
  const onMarkerSelectRef = useRef(onMarkerSelect);
  const onViewportChangeEndRef = useRef(onViewportChangeEnd);
  const onViewportSyncRef = useRef(onViewportSync);
  const onTileErrorRef = useRef(onTileError);
  const onVehicleSelectRef = useRef(onVehicleSelect);
  const onFollowInterruptedRef = useRef(onFollowInterrupted);
  const onAreaSelectRef = useRef(onAreaSelect);
  useEffect(() => {
    onAreaSelectRef.current = onAreaSelect;
    onMarkerSelectRef.current = onMarkerSelect;
    onViewportChangeEndRef.current = onViewportChangeEnd;
    onViewportSyncRef.current = onViewportSync;
    onTileErrorRef.current = onTileError;
    onVehicleSelectRef.current = onVehicleSelect;
    onFollowInterruptedRef.current = onFollowInterrupted;
  });

  // map 생성/획득. 풀에 보관된 인스턴스가 있으면 재사용(탭 전환 플래시 제거),
  // 없으면 신규. apiKey 가 바뀌면 재생성(드물게 — 키 갱신 시). poolKey 는 마운트
  // 수명 동안 불변으로 간주해 deps 에 넣지 않는다.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !apiKey) return;

    // map/tileSource 에 붙인 리스너 키 — cleanup 에서 unByKey 로 전부 해제한다.
    // 풀링하면 map/tileSource 가 살아남으므로 이전 마운트의 콜백 클로저가 남아
    // 중복 발화 + 누수가 된다. 미풀링(GC)이어도 해제는 무해.
    const eventKeys: EventsKey[] = [];

    // ── 풀에서 꺼내기(take) ─ delete 로 소유권을 가져와 StrictMode 이중 마운트/
    // 동시 마운트가 한 map 을 공유하는 사고를 막는다. apiKey 가 다르면(타일 URL
    // 에 키가 박혀 있음) 폐기 후 신규 경로로 폴백.
    const pooled = poolKey ? mapPool.get(poolKey) : undefined;
    if (poolKey && pooled) mapPool.delete(poolKey);
    const reusable = pooled && pooled.apiKey === apiKey ? pooled : undefined;
    if (pooled && !reusable) {
      pooled.map.setTarget(undefined);
      pooled.map.dispose();
    }

    // 재사용이면 풀의 tileSource 를 그대로 이어받는다(setUrl 금지 — 같은 URL 도
    // OL 이 타일 전체를 리프레시해 플래시). 신규면 새로 만든다.
    const tileSource =
      reusable?.tileSource ??
      new XYZ({
        url: buildVworldTileUrl(apiKey, layerRef.current),
        crossOrigin: 'anonymous',
      });
    tileSourceRef.current = tileSource;
    // 타일 실패(tileloaderror)는 키 거부와 동의어가 아니다 — 실측 결과 대부분은
    // 클라이언트 측 일시적 실패다: 빠른 패닝/줌으로 대량 타일을 동시에 요청하면
    // 브라우저가 리소스/커넥션 한계로 이미지 로드를 net::ERR_INSUFFICIENT_RESOURCES
    // 등으로 실패시킨다(서버는 정상, 같은 타일을 fetch 하면 200). OL 이미지 abort
    // 도 마찬가지. 따라서 연속 실패만으로 "키 무효" 배너를 띄우면 오탐이 난다.
    //
    // 전략: 연속 실패가 임계값을 넘으면 즉시 배너 대신 키를 fetch 로 직접 검사
    // 한다(낮은 줌의 단일 타일 — 과도 확대로 인한 타일 부재나 이미지 버스트
    // 실패에 안 휘말림). 검사 결과를 셋으로 나눈다:
    //   - 401/403 (서버가 키를 명시 거부) → 배너 표시 (진짜 키 무효)
    //   - 200 + image/* → 배너 억제/해제 + 카운터 리셋 (일시적 실패였음)
    //   - 그 외(throw·타임아웃·비-이미지·기타 status) → 판정 불가, 상태 유지
    // throw 를 "무효" 로 보지 않는 게 핵심 — 프로브 fetch 자체가 일시적으로
    // 실패해도 오탐을 내지 않는다. 타일이 한 장이라도 성공하면 즉시 리셋한다.
    const FAIL_THRESHOLD = 8;
    const PROBE_COOLDOWN_MS = 5000;
    // 키 유효성 확인용 저줌 타일 (서울 부근 z7). buildVworldTileUrl 의 템플릿을
    // 재사용해 엔드포인트 중복을 피한다.
    const probeUrl = buildVworldTileUrl(apiKey, 'Base').replace(
      '{z}/{y}/{x}',
      '7/44/109',
    );
    let consecutiveErrors = 0;
    let reported = false;
    let probing = false;
    let lastProbeAt = 0;

    const setReported = (next: boolean) => {
      if (reported === next) return;
      reported = next;
      onTileErrorRef.current?.(next);
    };

    const probeKeyOnBurst = async () => {
      if (probing) return;
      probing = true;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(probeUrl, { signal: controller.signal });
        if (res.status === 401 || res.status === 403) {
          setReported(true); // 키 거부 확정
        } else if (res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')) {
          consecutiveErrors = 0;
          setReported(false); // 키 정상 — 일시적 실패였음, 배너 억제/해제
        }
        // 그 외 status → 판정 불가, 상태 유지
      } catch {
        // fetch throw / abort(타임아웃) → 판정 불가, 상태 유지
      } finally {
        clearTimeout(timer);
        probing = false;
      }
    };

    eventKeys.push(
      tileSource.on('tileloaderror', () => {
        consecutiveErrors += 1;
        if (consecutiveErrors >= FAIL_THRESHOLD && !probing) {
          const now = Date.now();
          if (now - lastProbeAt >= PROBE_COOLDOWN_MS) {
            lastProbeAt = now;
            void probeKeyOnBurst();
          }
        }
      }),
    );
    eventKeys.push(
      tileSource.on('tileloadend', () => {
        consecutiveErrors = 0;
        setReported(false);
      }),
    );

    // ── map: 재사용 또는 신규 ─ 재사용이면 View 를 절대 건드리지 않는다(풀 뷰포
    // 트 = 마지막으로 보던 위치 ≈ transitMapViewport 저장값이라 initialCenter 로
    // 덮으면 이어보기가 깨진다). 신규면 baseLayer + View 만으로 만들고 벡터 레이어
    // 3종은 아래 addLayer 로 얹는다(재사용 경로와 공통).
    let map: OlMap;
    if (reusable) {
      map = reusable.map;
    } else {
      const baseLayer = new TileLayer({ source: tileSource });
      const center = initialCenter ?? markers[0] ?? { lat: 37.5665, lng: 126.978 };
      const view = new OlView({
        center: fromLonLat([center.lng, center.lat]),
        zoom: initialCenter?.zoom ?? DEFAULT_ZOOM,
      });
      map = new OlMap({
        target: container,
        // declutter 끔 — OL 의 layer declutter 는 Feature 단위라 라벨이 겹치면
        // 핀까지 같이 가려진다. 라벨 가시성은 style function 안에서 줌 임계값
        // (LABEL_VISIBLE_ZOOM)으로 직접 제어하고, 충돌 박스를 작게 만들어 핀이
        // 사라지지 않도록 한다.
        // baseLayer(index 0)만 생성자에 — 노선/정류장/차량 벡터 레이어는 아래
        // addLayer 로 얹는다(재사용 경로와 동일 순서).
        layers: [baseLayer],
        view,
        controls: [],
      });
    }
    mapRef.current = map;

    // ── 벡터 소스/레이어 4종 — 재사용/신규 공통, 마운트마다 새로 생성해 이전
    // 마운트의 feature/보간 상태를 이어받지 않는다. addLayer 순서 = 그리는 순서
    // (뒤일수록 위): 노선 형상(맨 아래) → 겸표시(보조) → 정류장 → 차량(맨 위).
    // 겸표시를 정류장 아래 둬 자기 도메인 마커가 위에 그려지고 클릭도 먼저 히트된다.
    // baseLayer 가 index 0 이라 append 순서만 맞으면 된다.
    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;
    const areaSource = new VectorSource();
    areaSourceRef.current = areaSource;
    const routeLineSource = new VectorSource();
    routeLineSourceRef.current = routeLineSource;
    const overlayMarkerSource = new VectorSource();
    overlayMarkerSourceRef.current = overlayMarkerSource;
    const vehicleSource = new VectorSource();
    vehicleSourceRef.current = vehicleSource;
    vehicleFeaturesRef.current.clear();
    vehicleAnimRef.current.clear();
    vehicleArrowsRef.current.clear();

    // 마커 레이어 공용 style function — feature 가 들고 있는 MapMarker(MARKER_PROP)와 선택 id·배경
    // 밝기를 평가 시점에 읽는다. 스타일은 function 이라 줌 변화 시 OL 이 자동 재평가(라벨 on/off)하고,
    // feature 마다 클로저를 따로 만들지 않는다. 겸표시는 선택 개념이 없어 항상 비선택 스타일.
    const markerStyleOf = (selectable: boolean) => (feature: FeatureLike, resolution: number) => {
      const m = feature.get(MARKER_PROP) as MapMarker | undefined;
      if (!m) return undefined;
      const zoom = mapRef.current?.getView().getZoomForResolution(resolution) ?? DEFAULT_ZOOM;
      return makeMarkerStyle(m, selectable && selectedIdRef.current === m.id, zoom, isDarkBaseRef.current);
    };

    const areaLayer = new VectorLayer({ source: areaSource });
    const routeLineLayer = new VectorLayer({ source: routeLineSource });
    const overlayMarkerLayer = new VectorLayer({ source: overlayMarkerSource, style: markerStyleOf(false) });
    const markerLayer = new VectorLayer({ source: vectorSource, style: markerStyleOf(true) });
    const vehicleLayer = new VectorLayer({ source: vehicleSource });
    // WMS 덮개 — 소스는 아래 effect 가 wmsOverlay 에 맞춰 넣는다(없으면 숨김).
    const wmsLayer = new TileLayer<TileWMS>({ visible: false });
    wmsLayerRef.current = wmsLayer;
    map.addLayer(wmsLayer);
    map.addLayer(areaLayer);
    map.addLayer(routeLineLayer);
    map.addLayer(overlayMarkerLayer);
    map.addLayer(markerLayer);
    map.addLayer(vehicleLayer);

    // 사용자 인터랙션 마크. pointerdrag = 드래그(panning), 휠은 별도. 추적
    // 중이면 그 즉시 끊고(followIdRef 비움 → tick 이 센터 이동 중단) 호출자에
    // 알린다(일시정지 UI). 재개는 호출자가 followVehicleId 를 다시 내려서 한다.
    const interruptFollow = () => {
      if (followIdRef.current) {
        followIdRef.current = null;
        onFollowInterruptedRef.current?.();
      }
    };
    eventKeys.push(
      map.on('pointerdrag', () => {
        userInteractedRef.current = true;
        interruptFollow();
      }),
    );
    const handleWheel = () => {
      userInteractedRef.current = true;
      interruptFollow();
    };
    container.addEventListener('wheel', handleWheel);

    const computeViewport = (): MapViewport | null => {
      const v = map.getView();
      const c = v.getCenter();
      const z = v.getZoom();
      if (!c || z === undefined) return null;
      const [lng, lat] = toLonLat(c);
      const ext = v.calculateExtent(map.getSize() ?? undefined);
      const [minLng, minLat] = toLonLat([ext[0]!, ext[1]!]);
      const [maxLng, maxLat] = toLonLat([ext[2]!, ext[3]!]);
      return {
        centerLng: lng!,
        centerLat: lat!,
        zoom: z,
        bbox: { minLng: minLng!, minLat: minLat!, maxLng: maxLng!, maxLat: maxLat! },
      };
    };

    eventKeys.push(
      map.on('moveend', () => {
        const viewport = computeViewport();
        if (!viewport) return;
        // sync 는 user/programmatic 무관 — 항상 최신 viewport 를 흘려서 호출자가
        // 검색 시점에 현재 영역을 알 수 있게 한다.
        onViewportSyncRef.current?.(viewport);
        // 기존 onViewportChangeEnd 의미는 보존 — 사용자가 직접 패닝/줌한 후에만
        // 발사. "이 지역 재검색" 버튼 노출 트리거.
        if (userInteractedRef.current) {
          onViewportChangeEndRef.current?.(viewport);
        }
      }),
    );

    // 첫 렌더 완료 직후 한 번 sync — 사용자가 패닝 안 하고 곧장 검색해도
    // viewport ref 가 비어 있지 않게. 재사용 경로에서도 아래 setTarget 후 재렌더로
    // 발화한다(마운트마다 재등록하므로 자연히 됨).
    eventKeys.push(
      map.once('postrender', () => {
        const viewport = computeViewport();
        if (viewport) onViewportSyncRef.current?.(viewport);
      }),
    );

    eventKeys.push(
      map.on('click', (evt) => {
        // markerId(정류장) 또는 vehicleId(차량) 가 있는 feature 만 후보 — 화살표
        // 등 그 외 feature 는 건너뛴다. 알약은 화살표 위(zIndex)라 먼저 히트된다.
        const f = map.forEachFeatureAtPixel(
          evt.pixel,
          (feat) => (feat.get('markerId') || feat.get('vehicleId') ? feat : undefined),
          { hitTolerance: 4 },
        );
        if (!f) {
          // 마커·차량이 없을 때만 면(배경) 히트 — 면은 어디나 덮고 있어 먼저 보면 마커를 못 누른다.
          const area = map.forEachFeatureAtPixel(evt.pixel, (feat) => (feat.get('areaKey') ? feat : undefined));
          const key = area?.get('areaKey') as string | undefined;
          if (key) onAreaSelectRef.current?.(key);
          return;
        }
        const markerId = f.get('markerId') as string | undefined;
        if (markerId) {
          onMarkerSelectRef.current?.(markerId);
          return;
        }
        const vehicleId = f.get('vehicleId') as string | undefined;
        if (vehicleId) onVehicleSelectRef.current?.(vehicleId);
      }),
    );

    // 재사용 마운트 — 새 컨테이너 DOM 에 붙이고 크기를 재측정한다. View 는 그대로
    // 두므로(뷰포트 유지) 타일 재요청 없이 캐시된 타일이 즉시 그려진다(플래시 X).
    if (reusable) {
      map.setTarget(container);
      map.updateSize();
    }

    // 컨테이너 크기가 바뀌면 OL 가 자체적으로 재측정하지 않으므로 직접 트리거.
    // 좌/우 패널 토글이나 윈도우 리사이즈 모두 한 번에 커버.
    const ro = new ResizeObserver(() => {
      mapRef.current?.updateSize();
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      container.removeEventListener('wheel', handleWheel);
      if (vehicleRafRef.current != null) cancelAnimationFrame(vehicleRafRef.current);
      vehicleRafRef.current = null;
      vehicleFeaturesRef.current.clear();
      vehicleAnimRef.current.clear();
      vehicleArrowsRef.current.clear();
      // map/tileSource 리스너 전부 해제 — 풀링으로 살아남는 map 에 이전 마운트의
      // 콜백 클로저가 남아 중복 발화/누수 되는 것을 막는다(미풀링이어도 무해).
      for (const k of eventKeys) unByKey(k);
      // 벡터 레이어 4종 제거 — 다음 마운트가 새 소스로 다시 addLayer 한다.
      // baseLayer(index 0)만 남겨 재사용 시 타일 캐시를 그대로 잇는다.
      map.removeLayer(wmsLayer);
      map.removeLayer(areaLayer);
      map.removeLayer(routeLineLayer);
      map.removeLayer(overlayMarkerLayer);
      map.removeLayer(markerLayer);
      map.removeLayer(vehicleLayer);
      map.setTarget(undefined);

      if (poolKey) {
        // 반납(release) — 다음 마운트가 setTarget 으로 이어받는다. layer/
        // userPickedLayer 도 함께 넘겨 재사용 시 setUrl(플래시) 없이 레이어 선택을
        // 잇는다. 방어: 정상 흐름에선 불가하나 이미 같은 키 엔트리가 있으면 지금
        // map 을 폐기하고 기존 풀을 보존한다(한 키를 둘이 다투는 상황 회피).
        if (mapPool.has(poolKey)) {
          map.dispose();
        } else {
          releaseToPool(poolKey, {
            map,
            tileSource,
            apiKey,
            layer: layerRef.current,
            userPickedLayer: userPickedLayerRef.current,
          });
        }
      }
      // poolKey 없으면 GC — map 은 이미 setTarget(undefined)(기존 동작 유지).

      mapRef.current = null;
      vectorSourceRef.current = null;
      routeLineSourceRef.current = null;
      areaSourceRef.current = null;
      overlayMarkerSourceRef.current = null;
      vehicleSourceRef.current = null;
      wmsLayerRef.current = null;
      tileSourceRef.current = null;
      userInteractedRef.current = false;
    };
    // initialCenter / markers 는 의도적으로 deps 에서 빼고 별도 effect 에서 갱신.
    // 처음 mount 직후 외 reflow 가 필요한 입력은 apiKey 뿐. poolKey 도 마운트
    // 수명 동안 불변으로 간주 — deps 에 넣지 않는다(값이 바뀌어도 재획득 안 함).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // 레이어 변경 — map 재생성 없이 타일 URL 만 교체하고, 바뀐 배경에 맞춰 라벨을
  // 다시 칠한다. 첫 렌더는 map-create effect 가 이미 올바른 레이어로 만들었으므로
  // 건너뛴다(같은 URL 로 setUrl 하면 OL 이 타일을 통째로 리프레시해 깜빡임).
  const layerInitRef = useRef(true);
  useEffect(() => {
    isDarkBaseRef.current = isDarkBaseLayer(layer);
    if (layerInitRef.current) {
      layerInitRef.current = false;
      return;
    }
    tileSourceRef.current?.setUrl(buildVworldTileUrl(apiKey, layer));
    // 라벨 색을 새 배경에 맞게 — feature 재생성 없이 style function 재평가만.
    vectorSourceRef.current?.changed();
    overlayMarkerSourceRef.current?.changed();
  }, [layer, apiKey]);

  // 마커 갱신 — markers 가 바뀌면 id 기준 차분으로 소스에 반영한다(syncMarkerFeatures). 호출자가
  // 내용이 같은 새 배열을 넘겨도(쿼리 재조회·라벨 대상 변경·부모 리렌더) feature 를 다시 만들지 않고,
  // 달라진 것만 추가·제거·다시 칠한다. 선택 상태는 deps 에 넣지 않는다: 레이어 style function 이
  // selectedIdRef 에서 읽으므로 선택만 바뀔 때는 아래 선택 effect 가 feature 2개만 다시 칠한다.
  // apiKey 는 map-create effect 가 소스를 새로 만들었을 때 다시 채우기 위한 의존(면 레이어와 같은 이유).
  useEffect(() => {
    const src = vectorSourceRef.current;
    if (!src) return;
    if (markerSyncSourceRef.current !== src) {
      // 소스가 새로 만들어졌다(재마운트·키 변경) — 이전 소스의 feature 색인은 버린다.
      markerSyncSourceRef.current = src;
      featureByIdRef.current = new Map();
    }
    syncMarkerFeatures(src, featureByIdRef.current, markers);
  }, [markers, apiKey]);

  // 겸표시 마커 갱신 — 별도 소스라 fitToMarkers extent 에 안 들어간다(겸표시가 화면을 넓히지
  // 않음). 선택 개념이 없어(상대 도메인 prefix id 라 selectedMarkerId 와 안 겹침) 레이어가 항상
  // 비선택 스타일로 그린다. 마커와 같은 차분 동기화 — 빠진 겸표시는 제거돼 주변 모드 이탈/토글 off
  // 시 잔상이 남지 않는다.
  useEffect(() => {
    const src = overlayMarkerSourceRef.current;
    if (!src) return;
    if (overlaySyncSourceRef.current !== src) {
      overlaySyncSourceRef.current = src;
      overlayByIdRef.current = new Map();
    }
    syncMarkerFeatures(src, overlayByIdRef.current, overlayMarkers ?? EMPTY_MARKERS);
  }, [overlayMarkers, apiKey]);

  // 면 오버레이 갱신 — areas 가 바뀔 때만(배경 토글·메트릭 전환·선택 변경) 전용 소스를 다시 칠한다.
  // 250개 clone + 스타일은 수 ms. 소스가 아직 없으면(map 생성 전) 다음 map-create 가 아니라 이 effect 가
  // areas 변경으로 다시 돌 때 그린다 — 그래서 map-create 직후에도 areas 를 한 번 더 반영한다(아래 deps).
  // 비우기·채우기는 한 번씩만 알린다(clear(true) + addFeatures) — 면마다 remove/add 이벤트와 공간 인덱스
  // 갱신을 따로 내지 않는다.
  useEffect(() => {
    const src = areaSourceRef.current;
    if (!src) return;
    src.clear(true);
    if (!areas) return;
    const next: Feature[] = [];
    for (const f of areas.features) {
      const style = areas.styleOf(f);
      if (!style) continue;
      const c = f.clone();
      c.set('areaKey', areas.keyOf(f));
      c.setStyle(style);
      next.push(c);
    }
    src.addFeatures(next);
  }, [areas, apiKey]);

  // WMS 덮개 갱신 — 내용(주소·인자)이 같으면 소스를 다시 만들지 않는다(타일 깜빡임). 지도가 다시 만들어지면(apiKey) 다시 넣는다.
  const wmsKey = wmsOverlay ? JSON.stringify(wmsOverlay) : '';
  useEffect(() => {
    const layer = wmsLayerRef.current;
    if (!layer) return;
    if (!wmsOverlay) {
      layer.setVisible(false);
      layer.setSource(null);
      return;
    }
    layer.setSource(new TileWMS({ url: wmsOverlay.url, params: wmsOverlay.params, projection: wmsOverlay.projection, transition: 0 }));
    layer.setMinZoom(wmsOverlay.minZoom ?? 0);
    layer.setOpacity(wmsOverlay.opacity ?? 1);
    layer.setVisible(true);
    // 내용은 wmsKey 로 본다(호출자가 렌더마다 새 객체를 넘겨도 다시 만들지 않게).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wmsKey, apiKey]);

  // 노선 형상 갱신 — routeLine 이 바뀔 때만 전용 소스를 다시 칠한다. 점이 2개
  // 미만이면(형상 없음/해제) 소스를 비운다. 이전 피처는 clear 로 확실히 제거해
  // 노선 전환/해제 시 누수가 없다.
  useEffect(() => {
    const src = routeLineSourceRef.current;
    if (!src) return;
    src.clear();
    if (!routeLine) return;
    // 단일 객체는 배열 1개로 정규화 — 지하철 지선은 여러 줄을 각각 피처로 그린다.
    const lines = Array.isArray(routeLine) ? routeLine : [routeLine];
    for (const line of lines) {
      if (line.points.length < 2) continue;
      const coords = line.points.map((p) => fromLonLat([p.lng, p.lat]));
      const feature = new Feature({ geometry: new LineString(coords) });
      feature.setStyle(
        new Style({
          stroke: new Stroke({
            color: strokeColorWithAlpha(line.color, 0.85),
            width: 5,
            lineCap: 'round',
            lineJoin: 'round',
          }),
        }),
      );
      src.addFeature(feature);
    }
  }, [routeLine]);

  // 차량 보간 — vehicles 가 바뀌면(폴링) 각 id 의 현재 표시 좌표에서 목표
  // 지점까지 등속 tween 을 예약하고 rAF 를 돌린다. via(도로 경유 웨이포인트)가
  // 있으면 그 경로를 따라, 없으면 직선(2점 경로) — 둘 다 같은 웨이포인트 tween
  // 으로 처리한다. 신규 id 는 즉시 배치, 사라진 id 는 제거, 아이콘(정차/주행)은
  // 매번 갱신. geometry 만 프레임마다 바꾸므로(스타일 재생성 없음) 버스 수 대비
  // 가볍다. 좌표는 EPSG:3857(≈m) — 잔여 0.5m 미만은 tween 생략(정차 떨림 방지).
  useEffect(() => {
    const src = vehicleSourceRef.current;
    if (!src) return;
    const now = performance.now();
    const feats = vehicleFeaturesRef.current;
    const anims = vehicleAnimRef.current;
    const arrows = vehicleArrowsRef.current;
    const seen = new Set<string>();
    // 방향 화살표 동기화 — 알약과 geometry 를 공유하는 별도 feature. 회전
    // 소스(형상 접선 bearingDeg 또는 tween 진행 방향)가 전혀 없으면 생성 보류
    // (북쪽 고정 화살표 오표시 방지), 기존 화살표는 마지막 회전을 유지한다.
    const syncArrow = (v: VehicleMarker, pill: Feature, rotationRad: number | null) => {
      const cur = arrows.get(v.id);
      if (!v.dirIconSrc) {
        if (cur) {
          src.removeFeature(cur.feature);
          arrows.delete(v.id);
        }
        return;
      }
      if (cur && cur.src === v.dirIconSrc) {
        if (rotationRad !== null) cur.icon.setRotation(rotationRad);
        return;
      }
      // 신규 또는 색(노선) 변경 — 재생성. 이전 회전이라도 있으면 물려받는다.
      const rot = rotationRad ?? cur?.icon.getRotation() ?? null;
      if (cur) {
        src.removeFeature(cur.feature);
        arrows.delete(v.id);
      }
      if (rot === null) return;
      const icon = new Icon({ anchor: [0.5, 0.5], src: v.dirIconSrc, rotation: rot });
      const f = new Feature({ geometry: pill.getGeometry()! });
      f.setStyle(new Style({ image: icon, zIndex: 0 }));
      src.addFeature(f);
      arrows.set(v.id, { feature: f, icon, src: v.dirIconSrc });
    };
    for (const v of vehicles ?? []) {
      seen.add(v.id);
      const to = fromLonLat([v.lng, v.lat]) as XY;
      // 알약은 화살표(zIndex 0) 위에 — 같은 소스 내 렌더 순서 보장.
      const style = new Style({
        zIndex: 1,
        image: new Icon({ anchor: [0.5, 0.5], src: v.iconSrc }),
      });
      // 형상 접선 방위각(도) → OL rotation(라디안). 정차 중에도 '갈 방향'.
      const bearingRad = v.bearingDeg != null ? (v.bearingDeg * Math.PI) / 180 : null;
      const existing = feats.get(v.id);
      if (!existing) {
        const f = new Feature({ geometry: new Point(to) });
        f.set('vehicleId', v.id); // 클릭 → onVehicleSelect(따라가기 대상 지정)
        f.setStyle(style);
        src.addFeature(f);
        feats.set(v.id, f);
        anims.delete(v.id); // 신규는 tween 없이 즉시 위치
        syncArrow(v, f, bearingRad);
        continue;
      }
      const geom = existing.getGeometry() as Point;
      const from = geom.getCoordinates() as XY;
      // 아이콘(정차/주행/색) 변화 반영 — 같은 src 면 OL 이미지 캐시 재사용.
      existing.setStyle(style);
      // 웨이포인트 결정 — via 는 이전 폴링 위치→현재 위치의 도로 슬라이스라
      // 현재 표시 좌표(from, 직전 tween 미완 지점)와 어긋날 수 있다. 투영으로
      // 이어 붙이되, 경로에서 40m 넘게 벗어나 있으면(모드 전환/데이터 점프)
      // 직선 폴백 — 시작 순간 마커가 경로 위로 순간이동하지 않게.
      let handled = false;
      if (v.via && v.via.length >= 2) {
        const viaPts = v.via.map((w) => fromLonLat([w.lng, w.lat]) as XY);
        const cum = buildCumLengths(viaPts);
        const proj = projectPathS(viaPts, cum, from);
        if (proj.dist <= 40) {
          handled = true;
          const remain = cum[cum.length - 1]! - proj.s;
          if (remain < 0.5) {
            geom.setCoordinates(viaPts[viaPts.length - 1]!);
            anims.delete(v.id);
            syncArrow(v, existing, bearingRad);
          } else {
            anims.set(v.id, {
              pts: viaPts,
              cum,
              s0: proj.s,
              start: now,
              dur: vehicleTweenMs,
            });
            syncArrow(v, existing, bearingRad ?? pathDirectionAt(viaPts, cum, proj.s));
          }
        }
      }
      if (!handled) {
        // 직선 폴백 — from→to 2점 경로.
        if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 0.5) {
          geom.setCoordinates(to);
          anims.delete(v.id);
          syncArrow(v, existing, bearingRad);
        } else {
          const pts: XY[] = [from, to];
          const cum = buildCumLengths(pts);
          anims.set(v.id, { pts, cum, s0: 0, start: now, dur: vehicleTweenMs });
          syncArrow(v, existing, bearingRad ?? pathDirectionAt(pts, cum, 0));
        }
      }
    }
    // 이번 폴링에 없는 차량 제거(운행 종료/구간 이탈).
    for (const [id, f] of feats) {
      if (!seen.has(id)) {
        src.removeFeature(f);
        feats.delete(id);
        anims.delete(id);
        const arrow = arrows.get(id);
        if (arrow) {
          src.removeFeature(arrow.feature);
          arrows.delete(id);
        }
      }
    }
    // rAF 구동 — 이미 돌고 있으면(vehicleRafRef!=null) 갱신된 anims 를 그대로
    // 이어받는다(anims/feats 는 렌더 간 고정 ref 객체).
    if (anims.size > 0 && vehicleRafRef.current == null) {
      const tick = () => {
        const t = performance.now();
        // 따라가기 중이 아니면 눈에 보일 만큼 움직였을 때만 좌표를 다시 쓴다(위 vehicleApplyIntervalMs).
        // 따라가기는 카메라가 매 프레임 차량을 쫓아야 해서 건너뛰지 않는다.
        if (
          !followIdRef.current &&
          t - vehicleLastApplyRef.current <
            vehicleApplyIntervalMs(anims, mapRef.current?.getView().getResolution())
        ) {
          vehicleRafRef.current = requestAnimationFrame(tick);
          return;
        }
        vehicleLastApplyRef.current = t;
        let active = false;
        for (const [id, a] of anims) {
          const f = feats.get(id);
          if (!f) {
            anims.delete(id);
            continue;
          }
          const total = a.cum[a.cum.length - 1]!;
          const p = Math.min(1, (t - a.start) / a.dur);
          const s = a.s0 + (total - a.s0) * p;
          (f.getGeometry() as Point).setCoordinates(samplePathAt(a.pts, a.cum, s));
          // 화살표 회전 — 현재 세그먼트 진행 방향(geometry 공유라 위치는 자동).
          const arrow = arrows.get(id);
          if (arrow) {
            const dir = pathDirectionAt(a.pts, a.cum, s);
            if (dir !== null) arrow.icon.setRotation(dir);
          }
          if (p < 1) active = true;
          else anims.delete(id);
        }
        // 따라가기 — 대상 차량 위치로 지도 중심을 매 프레임 이동(추적). tween
        // 이 부드러움을 이미 만드니 setCenter(즉시)로도 자연스럽게 붙는다.
        const fid = followIdRef.current;
        if (fid) {
          const ff = feats.get(fid);
          if (ff) mapRef.current?.getView().setCenter((ff.getGeometry() as Point).getCoordinates());
        }
        vehicleRafRef.current = active ? requestAnimationFrame(tick) : null;
      };
      vehicleRafRef.current = requestAnimationFrame(tick);
    }
  }, [vehicles, vehicleTweenMs]);

  // 따라가기 대상 지정/재개 — prop 이 새 id 로 바뀌는 순간(탭 또는 '다시
  // 따라가기') 한 번 부드럽게 센터링하고, 이후엔 tick 이 추적을 이어간다.
  // 이 effect 는 미러 ref 동기화도 겸한다(사용자 조작으로 ref 만 null 이 된 뒤
  // 같은 값으로 재개될 때 prop 변화가 없으면 재센터링이 안 되므로, 호출자는
  // 재개 시 반드시 값 전환(null→id)을 만든다).
  useEffect(() => {
    followIdRef.current = followVehicleId ?? null;
    if (!followVehicleId) return;
    const f = vehicleFeaturesRef.current.get(followVehicleId);
    const map = mapRef.current;
    if (!f || !map) return;
    userInteractedRef.current = false;
    map.getView().animate({
      center: (f.getGeometry() as Point).getCoordinates(),
      duration: 300,
    });
  }, [followVehicleId]);

  // 선택 변경 — vectorSource 는 건드리지 않고 이전/현재 마커 feature 2개만
  // changed() 로 다시 칠한다 (style function 이 selectedIdRef 를 다시 읽음). N→2.
  useEffect(() => {
    selectedIdRef.current = selectedMarkerId;
    const prev = prevSelectedIdRef.current;
    if (prev === selectedMarkerId) return;
    prevSelectedIdRef.current = selectedMarkerId;
    const byId = featureByIdRef.current;
    if (prev) byId.get(prev)?.changed();
    if (selectedMarkerId) byId.get(selectedMarkerId)?.changed();
  }, [selectedMarkerId]);

  // 외부 imperative API
  useImperativeHandle(
    ref,
    () => ({
      flyTo(lat, lng, zoom, opts) {
        const map = mapRef.current;
        if (!map) return;
        const v = map.getView();
        // 외부 호출은 사용자 인터랙션이 아니라고 가정 — onViewportChangeEnd
        // 발사 안 함 (userInteractedRef false 유지).
        userInteractedRef.current = false;
        const targetZoom = zoom ?? v.getZoom() ?? DEFAULT_ZOOM;
        v.animate({
          center: centerWithBottomInset(v, fromLonLat([lng, lat]), targetZoom, opts?.bottomInset),
          zoom: targetZoom,
          duration: 350,
        });
      },
      flyToZoomIn(lat, lng, minZoom, opts) {
        const map = mapRef.current;
        if (!map) return;
        const v = map.getView();
        userInteractedRef.current = false;
        // 줌아웃 방지 — 현재 줌이 minZoom 보다 크면 그대로 둔다.
        const targetZoom = Math.max(minZoom, v.getZoom() ?? minZoom);
        v.animate({
          center: centerWithBottomInset(v, fromLonLat([lng, lat]), targetZoom, opts?.bottomInset),
          zoom: targetZoom,
          duration: 350,
        });
      },
      fitToMarkers(padding = 60) {
        const map = mapRef.current;
        const src = vectorSourceRef.current;
        if (!map || !src) return;
        const ext = src.getExtent();
        if (!ext || !Number.isFinite(ext[0])) return;
        userInteractedRef.current = false;
        map.getView().fit(ext, {
          padding: [padding, padding, padding, padding],
          duration: 350,
          maxZoom: 17,
        });
      },
      fitToCoords(coords, padding = 60, opts) {
        const map = mapRef.current;
        if (!map || coords.length === 0) return;
        const bottom = padding + Math.max(0, opts?.bottomInset ?? 0);
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const c of coords) {
          const [x, y] = fromLonLat([c.lng, c.lat]);
          if (x! < minX) minX = x!;
          if (x! > maxX) maxX = x!;
          if (y! < minY) minY = y!;
          if (y! > maxY) maxY = y!;
        }
        if (!Number.isFinite(minX)) return;
        userInteractedRef.current = false;
        map.getView().fit([minX, minY, maxX, maxY], {
          padding: [padding, padding, bottom, padding],
          duration: 350,
          maxZoom: 17,
        });
      },
    }),
    [],
  );

  return (
    <div className={className ?? 'h-full w-full'} style={{ position: 'relative' }}>
      {/* OL 타깃은 내부 div — 레이어 컨트롤을 React 형제로 깔끔히 오버레이하기
          위해 OL 이 관리하는 DOM 과 분리한다. */}
      <div ref={containerRef} className="absolute inset-0" />
      {layerControl && apiKey && (
        <MapLayerControl value={layer} onChange={handlePickLayer} />
      )}
    </div>
  );
});

// primary(빨강) / muted(회색) 둘 다 같은 빌더를 쓴다 — variant 는 배경색 톤만
// 결정하고, 카테고리는 안쪽 라인 아이콘으로 일관되게 표시. 앱(publicRestaurantsMapHtml)
// 과 동일 디자인.
//
// zoom 기준 분기:
//   - selected : 항상 풀사이즈 핀 + 라벨 (선택 마커는 줌과 무관하게 식별 가능)
//   - zoom >= LABEL_VISIBLE_ZOOM : 풀사이즈 핀 + 라벨
//   - zoom <  LABEL_VISIBLE_ZOOM : SMALL_ICON_SCALE 배율 축소 핀, 라벨 없음
//   (마커가 labelZoom·compactScale 을 들고 오면 그 값으로)
const makeMarkerStyle = (m: MapMarker, selected: boolean, zoom: number, darkBg: boolean): Style => {
  const { label, icon } = m;
  const variant = m.variant ?? 'primary';
  const categoryKey = m.categoryKey ?? null;
  const compact = !selected && zoom < (m.labelZoom ?? LABEL_VISIBLE_ZOOM) && !m.fixedScale;
  const scale = compact ? (m.compactScale ?? SMALL_ICON_SCALE) : 1;
  const zIndex = selected ? 1000 : (m.zIndex ?? 0);
  // 스타일 캐시 — OL 은 매 프레임 style function 을 부르므로 feature 가 수천 개(일상지도 CCTV
  // 점)면 프레임마다 Style/Icon 을 수천 개 새로 만들어 메인 스레드가 수 초 멈춘다. 입력이 같으면
  // 같은 Style 인스턴스를 돌려준다(OL 권장 패턴 — Style 은 feature 간 공유해도 안전). 라벨
  // 문자열까지 키에 넣으므로 항목 수만큼만 불어나고, 상한을 넘으면 통째로 비운다.
  const showLabel = !!label && !compact;
  // 아이콘은 data URL 대신 번호(iconSrcId)로 — 긴 문자열을 호출마다 이어 붙이지 않는다.
  const cacheKey = `${iconSrcId(icon?.src)}|${iconSrcId(icon?.selectedSrc)}|${categoryKey ?? ''}|${variant}|${selected ? 1 : 0}|${scale}|${zIndex}|${showLabel ? label : ''}|${darkBg ? 1 : 0}`;
  const cached = markerStyleCache.get(cacheKey);
  if (cached) return cached;
  // 어두운 베이스맵(야간/위성) 위에서는 글자/외곽선을 반전 — 흰 글자 + 어두운
  // 외곽선이라야 가독성이 산다. 밝은 맵에서는 기존 어두운 글자 + 흰 외곽선.
  const labelFill = darkBg ? '#f8fafc' : '#0f172a';
  const labelStroke = darkBg ? '#0f172a' : '#fff';
  const src = icon
    ? selected
      ? icon.selectedSrc
      : icon.src
    : buildRestaurantMarkerDataUrl(categoryKey, selected, variant);
  const anchor = selected ? PIN_ANCHOR : CENTER_ANCHOR;
  const style = new Style({
    // 선택 마커는 다른 마커 위로 — feature 들이 겹칠 때 강조 핀이 가려지지 않게
    // 렌더 순서를 끌어올린다 (OL 은 zIndex 큰 Style 을 나중에=위에 그린다).
    zIndex,
    // 여러 마커가 같이 쓰는 아이콘은 한 번 구운 canvas 로 그린다(mapIconRaster). 그림이 아직 로드 전이면
    // 예전과 같은 src 아이콘이 오고, 구울 수 있게 됐을 때 이 Style 을 버려 다음 평가에서 다시 만들게 한다.
    image: icon?.perMarker
      ? new Icon({ anchor: [anchor[0], anchor[1]], src, scale })
      : markerIcon(src, scale, anchor, () => markerStyleCache.delete(cacheKey)),
    text:
      showLabel
        ? new OlText({
            text: label,
            offsetY: selected ? -54 : 20,
            font: selected ? 'bold 12px sans-serif' : '11px sans-serif',
            fill: new Fill({ color: labelFill }),
            stroke: new Stroke({ color: labelStroke, width: 3 }),
          })
        : undefined,
  });
  if (markerStyleCache.size >= MARKER_STYLE_CACHE_MAX) {
    // 번호표도 같이 비운다 — 캐시가 비었으니 번호가 다시 1부터 매겨져도 옛 키와 부딪힐 일이 없다.
    // (이 호출의 cacheKey 는 비우기 전 번호로 만든 것이라, 새 번호 체계와 섞이지 않게 저장을 건너뛴다.)
    markerStyleCache.clear();
    iconSrcIds.clear();
    return style;
  }
  markerStyleCache.set(cacheKey, style);
  return style;
};
