---
topic: map
type: codebase
last_compiled: 2026-06-25
source_count: 26
status: active
aliases: [muted-marker, gray-pin, map-resize-observer, discover-map, registered-vs-search-marker, webview-vworld, fly-to-zoom, marker-fly, selected-marker-pin, label-always-visible, location-fly-bbox, public-restaurants-webview-map, line-icon, category-icon, restaurant-category-icon, declutter, zoom-label, compact-marker, generic-fork-knife-icon, my-location-button, geolocation-guide, insecure-context, native-location-permission-ux, open-settings-alert, map-layer-control, dark-tile, midnight-layer, satellite-layer, theme-linked-map, fly-to-zoom-in, double-click-zoom, set-mode-webview, choropleth, sigungu-geo, region-stats-map, point-in-polygon, vworld-tile-probe, tile-error-probe, selected-marker-zindex]
---

# map

**2026-06-25 변경 흡수 (18차, choropleth 지역 통계 지도 + vworld 타일 오탐 probe + 선택 마커 위로)** — 렌더 코어를 일부 건드린다. 핵심 3가지: (1) **지역 통계 choropleth 지도(신규 사용처)** — 어드민 지역 통계 위젯에 신규 [RegionStatsMap.tsx](../../apps/web/src/components/admin/RegionStatsMap.tsx) 가 들어왔다. `MapCanvas`(레스토랑 핀 전용)를 안 거치고 **OpenLayers 를 직접** 쓰는 별도 컴포넌트로, vworld 타일 위에 `색칠(choropleth)/버블/마커` 3모드를 토글한다. 색칠 모드는 시군구 경계 GeoJSON([public/sigungu-geo.json](../../apps/web/public/sigungu-geo.json), 552KB)을 지연 fetch 해 `GeoJSON().readFeatures` 로 폴리곤 레이어를 얹고, 카운트는 **이름 매칭이 아니라** 가게 좌표의 point-in-polygon(`geometry.intersectsCoordinate`)으로 매겨 명칭/구·시 단위 차이를 회피한다. 타일 빌더(`buildVworldTileUrl`)·테마 연동(`useThemeStore.mode → midnight/Base`)은 `MapCanvas` 와 같은 패턴 재사용. (2) **vworld 타일 오류 배너를 키 직접 검사(probe)로 판정** — `tileloaderror` 단발/연속은 키 거부와 동의어가 아니다(빠른 패닝 시 브라우저 리소스 한계로 `net::ERR_INSUFFICIENT_RESOURCES`, 서버는 정상). `MapCanvas` 가 연속 실패 8회 임계를 넘으면 즉시 배너 대신 저줌 단일 타일을 `fetch` 로 직접 probe 해 401/403(거부)일 때만 배너를 띄우고, 200+image 면 억제/해제, throw·기타는 상태 유지. `onTileError` 시그니처가 `()=>void` 에서 `(hasError: boolean)=>void` 로 바뀌어 해제도 전달. (3) **선택 마커를 다른 마커 위로** — OL Style 에 `zIndex`(선택 1000 / 비선택 0)를 줘 클릭 강조 핀이 인접 핀에 안 가린다. **이번 라운드는 16/17차의 호버·레이어·더블클릭 정책에 변경 없음** — 위 셋만 추가.

**2026-06-06 변경 흡수 (17차, 다크/위성 레이어 + 내 위치 공용화 + 더블클릭 확대)** — 이번 라운드는 16차와 달리 렌더 코어를 **건드린다**. 핵심 3가지: (1) **레이어 토글** — 신규 [MapLayerControl.tsx](../../apps/web/src/components/restaurant/MapLayerControl.tsx) 가 웹 `MapCanvas` 좌하단에 일반(`Base`)/다크(`midnight`)/위성(`Satellite`) 3버튼을 깐다. 초기 레이어는 앱 테마(`useThemeStore.mode`)를 따라가고(`light→Base`, `dark→midnight`), 사용자가 한 번 직접 고르면 이후 테마 변경에 끌려가지 않는다(`userPickedLayerRef`). 레이어 변경은 OL Map 재생성 없이 `tileSource.setUrl` 로 URL 만 교체 + 라벨 색 재평가만. (2) **`MyLocationButton` 공용화** — 기존 `PublicRestaurantsMap.tsx` 안에 살던 내부 컴포넌트를 신규 파일 [MyLocationButton.tsx](../../apps/web/src/components/restaurant/MyLocationButton.tsx) 로 추출해 공개 지도 + 어드민 발견 지도(`DiscoverMap`)가 공유. `denied`/`insecure`(평문 HTTP) 구분 UX 동일. (3) **앱 WebView 다크 타일** — `buildPublicRestaurantsMapHtml(apiKey, center, mode)` 가 `mode='dark'` 면 `midnight` 타일 + 어두운 배경 + 반전 라벨로 빌드하고, 런타임 테마 변경은 HTML 재빌드(=WebView 재마운트) 없이 `window.__setMode` 주입으로 처리. 추가로 **더블클릭=확대** — `MapCanvasHandle.flyToZoomIn(lat,lng,minZoom)` 신규 메서드 + 양 wrapper 의 `zoomFocus: { placeId }` prop(참조 바뀔 때마다 `ZOOM_IN_LEVEL=17` 까지 당김, 이미 더 확대면 줌 유지). 단순 호버 패닝은 **제거** — `PublicRestaurantsMap` 는 더 이상 `hoveredPlaceId` 를 받지 않고 `selectedPlaceId`(클릭) 로만 `flyTo`.

**2026-06-01 변경 흡수 (16차, perf/UX 라운드 — 렌더 코어 무변경)** — 이 라운드는 지도 도메인의 렌더링 코어(OpenLayers Map 인스턴스, 마커 빌더, 줌 임계값, declutter 정책)에 **변경 없음**. 두 파일이 터치됐지만 모두 위치 권한 UX 다듬기였다: 앱·웹 "내 위치" 버튼이 `denied`/`unavailable` 에서 비활성 대신 클릭 가능해지고 silent refetch + 설정 안내를 건다(상세는 [Gotchas](#gotchas-coverage-high----13-sources)). 17차에서 웹 측 그 로직이 `MyLocationButton.tsx` 로 추출됐다.

**2026-05-25 변경 흡수 — 카테고리별 라인 아이콘 8종 + variant 통합 + declutter 해제로 줌 아웃 마커 누락 수정**: (1) `MapMarker` 에 `categoryKey?: RestaurantCategoryKey | null` 추가. 한식/일식/중식/카페/디저트/바/양식/분식 8 카테고리를 SVG 라인 아이콘으로 핀 안쪽에 그린다. 자유 텍스트 카테고리는 [packages/utils/src/restaurantCategory.ts](../../packages/utils/src/restaurantCategory.ts) 의 `resolveRestaurantCategoryKey` 가 키워드 우선순위 매칭으로 정규화. 매칭 실패는 generic 식기(포크+나이프) 아이콘. (2) primary/muted variant + selected + 8 + generic 조합을 단일 빌더 `buildRestaurantMarkerSvg` / `buildRestaurantMarkerDataUrl` 로 통합 — 웹·앱이 같은 SVG. (3) 줌 아웃 마커 누락 수정 — 웹 declutter 해제 + 줌 임계값(`LABEL_VISIBLE_ZOOM=14`) 기준 라벨만 토글, 작은 줌에서는 핀도 `SMALL_ICON_SCALE=0.55` 축소.

## Purpose [coverage: high -- 8 sources]

vworld 지도 타일을 OpenLayers 위에 직접 그려, 여러 화면에 같은 타일·테마·키 인프라를 공급하는 도메인. `MapCanvas`(레스토랑 핀 전용) 를 거치는 세 화면은 — 첫째 어드민 식당 상세 페이지 우측 사이드바의 단일 마커 위치 카드(작은 사이드 박스 + 우측 슬라이드오버 풀 사이즈), 둘째 공개 `/restaurants` 지도 페이지의 다중 마커 + "이 지역에서 재검색" 위젯, 셋째 어드민 발견(`/admin/discover`) 페이지의 검색 결과·등록 맛집 합성 마커 화면이다. **(2026-06)** 넷째로 어드민 지역 통계 위젯의 [RegionStatsMap](../../apps/web/src/components/admin/RegionStatsMap.tsx) 가 합류했는데, 이건 `MapCanvas` 를 안 거치고 같은 타일/테마 헬퍼만 공유하는 **별도 OpenLayers 컴포넌트**다 — 가변 사이즈 버블·시군구 폴리곤 색칠(choropleth)이 핀 빌더와 안 맞아 직접 구성. 어드민 키 등록·연결 테스트 UI(`/admin/settings/map`) 까지가 이 도메인의 책임 범위 — friendly 의 `MapProviderConfig` 테이블에서 시작해 web 의 OpenLayers `Map` 인스턴스까지 끊김 없이 한 줄로 이어진다.

키는 운영자가 vworld 콘솔에서 발급받아 어드민 화면에 붙여넣어 등록한다. 어드민 화면은 평문 `apiKey` 를 다시 받아 `probeVworldKey` 로 한 장 타일을 fetch 해 보고 OK/거부를 즉시 보여준다. 같은 키를 공개 페이지가 호출할 수 있도록 `/api/v1/settings/map/public` 만 인증 없이 열어두고, 어드민 보호 라우트와 평문 응답을 그대로 공유한다 (보안 등급 동일 — 키는 어차피 브라우저 Network 탭에 노출되는 클라이언트 사이드 자원).

지도는 베이스맵 레이어를 일반/다크/위성 3종으로 토글할 수 있고(좌하단 `MapLayerControl`), 초기값은 **앱 테마**(라이트→일반, 다크→야간)를 따른다. 앱(WebView) 측도 같은 전략을 쓴다 — vworld 가 제공하는 실제 `midnight` 다크 타일이라 CSS invert 같은 트릭이 없다. 자세한 건 [Key Decisions](#key-decisions-coverage-high----16-sources)·[platform-ui-split](../concepts/platform-ui-split.md).

`MapCanvas` 호출자 요약:

| 호출자 | 라우트 | 마커 | variant | categoryKey | 레이어 컨트롤 | 내 위치 |
|---|---|---|---|---|---|---|
| `VWorldMap` | 어드민 식당 상세 사이드 카드 + 슬라이드오버 | 1개 | primary | 미사용 (단일 핀) | (기본 노출) | 미사용 |
| `PublicRestaurantsMap` | 공개 `/restaurants` | N개 (검색 결과) | primary | `resolveRestaurantCategoryKey(it.category)` | 노출 | 사용(첫 도착 + 재요청) |
| `DiscoverMap` | 어드민 `/admin/discover` | N개 (검색 + 등록 합성) | primary (검색) / muted (등록) | (옵션) | 노출 | 사용(버튼 클릭만) |

## Architecture [coverage: high -- 12 sources]

저레벨 캔버스 한 개와 세 개의 화면별 wrapper 로 구성되고, 모바일(WebView/iframe) 측에 동형 코어가 한 벌 더 있다. **(2026-06)** 여기에 `MapCanvas` 를 거치지 않고 타일/테마 헬퍼만 공유하는 어드민 통계용 `RegionStatsMap` 한 개가 더 붙는다.

1. **`MapCanvas`** ([apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx)) — vworld WMTS 키를 받아 OpenLayers `Map` 인스턴스를 만들고, 마커 배열·선택 상태·viewport 콜백·tile 에러 콜백을 props 로 받는다. 마커 클릭 → `onMarkerSelect`, 사용자 패닝/줌 → `onViewportChangeEnd`, 모든 viewport 변경 → `onViewportSync`. `useImperativeHandle` 로 `flyTo` / `flyToZoomIn` / `fitToMarkers` 를 외부에 노출 — 카드 호버/클릭/더블클릭의 imperative 동작 전용. **(2026-06)** 좌하단 레이어 토글(`MapLayerControl`)을 React 형제로 오버레이하기 위해, OL 타깃 div(`containerRef`)를 `absolute inset-0` 으로 감싸 OL 이 관리하는 DOM 과 분리했다. 레이어 상태(`layer`)는 컴포넌트 state 이고 초기값은 `useThemeStore.mode` 를 따른다. **(2026-06, 18차)** 선택 마커가 인접 핀에 가리지 않도록 style 에 `zIndex`(선택 1000 / 비선택 0)를 준다 — 선택 변경이 style 함수를 재평가하므로 클릭 즉시 반영. 타일 에러 판정은 단순 `tileloaderror` 1회 플래그에서 **연속 실패 임계 + 키 직접 probe** 로 바뀌었다(아래 "타일 에러 — probe 판정" 절).
2. **`VWorldMap`** ([apps/web/src/components/restaurant/VWorldMap.tsx](../../apps/web/src/components/restaurant/VWorldMap.tsx)) — 어드민 식당 상세 단일 마커 wrapper. `useMapProviderSecret('vworld')` 로 평문 키를 가져와 `MapCanvas` 에 박는다. 좌표 누락/키 누락/로딩/타일에러 4가지를 `<Placeholder>` 로 분기.
3. **`PublicRestaurantsMap`** ([apps/web/src/components/restaurant/PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx)) — 공개 `/restaurants` 지도 wrapper. `useMapPublicConfig` 로 키 가져옴. 각 마커에 `categoryKey: resolveRestaurantCategoryKey(it.category)` 를 박는다. "이 지역에서 재검색" 버튼, "전체 영역" 토글, "내 위치"(`MyLocationButton`)가 여기 살고, 핸들 ref 로 `flyTo`/`flyToZoomIn` 을 호출한다. **(2026-06)** 더 이상 `hoveredPlaceId` 를 받지 않는다 — 단순 호버 패닝을 없애고 `selectedPlaceId`(카드/마커 클릭)로만 `flyTo`. 더블클릭 "확대"는 신규 `zoomFocus: { placeId } | null` prop 으로 — 참조가 바뀔 때마다 해당 식당으로 `flyToZoomIn(...ZOOM_IN_LEVEL=17)`. `MyLocationButton` 은 이제 [MyLocationButton.tsx](../../apps/web/src/components/restaurant/MyLocationButton.tsx) 로 추출돼 이 파일은 import 만 한다.
4. **`DiscoverMap`** ([apps/web/src/components/admin/discover/DiscoverMap.tsx](../../apps/web/src/components/admin/discover/DiscoverMap.tsx)) — 어드민 발견(`/admin/discover`) wrapper. 검색 결과(빨강) + 등록 맛집(회색)을 한 지도에 합성, 같은 placeId 는 `muted` 우선. **(2026-06)** 공개 지도와 동일한 `zoomFocus`(더블클릭→`flyToZoomIn` ZOOM_IN_LEVEL=17) + `focusCoord`/`locationStatus`/`onRequestLocation`(내 위치) prop 을 받게 됐다. 어드민은 첫 진입 자동 도착이 없고(등록 마커 `fitToMarkers` 우선), "내 위치" 버튼 클릭으로만 `focusCoord` 가 들어와 `MY_LOCATION_ZOOM=16` 동네 수준으로 fly. `MyLocationButton` 은 패널 반대편 모서리에 고정 배치(좌측 모서리면 먼저, 우측이면 "전체 영역" 뒤) — "전체 영역" 토글 시 흔들리지 않게.
5. **`RegionStatsMap`** ([apps/web/src/components/admin/RegionStatsMap.tsx](../../apps/web/src/components/admin/RegionStatsMap.tsx)) — **(2026-06 신규)** 어드민 지역 통계 위젯 전용. `MapCanvas` 를 안 거치고 OL `Map` 을 직접 만든다(가변 버블·폴리곤 색칠이 핀 빌더와 안 맞음). 타일/테마는 같은 헬퍼(`buildVworldTileUrl`, `useThemeStore.mode → layerForTheme`)·키 훅(`useMapPublicConfig`) 재사용. `색칠/버블/마커` 3모드(기본 색칠):
   - **choropleth(색칠)** — 시군구 경계 GeoJSON 을 `${BASE_URL}sigungu-geo.json` 에서 **지연 fetch**(모드 진입 시 1회, `geoCacheRef` 캐시) → `new GeoJSON().readFeatures(..., { featureProjection: 'EPSG:3857' })` 로 폴리곤 feature 화 → `data.points`(좌표 보유 가게)를 각 폴리곤에 `geom.intersectsCoordinate(coord)` point-in-polygon 으로 카운트 → `choroplethStyle(count, maxCount)`(0 거의 투명, 많을수록 진한 파랑 `rgba(37,99,235, 0.25~0.8)` + 숫자 라벨). 카운트 0 폴리곤은 라벨 없음, fit 은 카운트>0 폴리곤 우선. `choroState`(idle/loading/error)로 "경계 불러오는 중"/"불러오지 못했습니다" 오버레이.
   - **bubble(버블)** — 시군구 centroid(`regions.json` 집계의 `lat/lng`)에 `bubbleRadius`(sqrt 스케일 10~34px) 원 + 숫자.
   - **markers(마커)** — 가게별 5px 점.
   타일 레이어 교체는 `MapCanvas` 와 동일하게 맵 재생성 없이 `tileSource.setUrl(buildVworldTileUrl(apiKey, layerForTheme(themeMode)))`. 키 미등록(404)/로딩/에러는 `MapShell` placeholder 분기.
6. **`PublicRestaurantsWebMap`** (앱 — [.native.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.native.tsx) / [.web.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.web.tsx)) — 앱(iOS/Android/Expo Web)의 공개 맛집 지도. WebView/iframe 안에 [publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts) 의 인라인 HTML(OpenLayers + vworld WMTS)을 띄운다. 웹 `PublicRestaurantsMap` 과 동일 입력(`items`, `selectedPlaceId`, `appliedBbox`, `focusCoord`)을 받고 `resolveRestaurantCategoryKey` 로 카테고리를 정규화. **(2026-06)** `useTheme()` 의 `theme.mode` 를 받아, **초기 HTML 빌드에만** 모드를 박는다(`buildPublicRestaurantsMapHtml(apiKey, center, mode)`). 이후 모드 변경은 HTML 재빌드(=WebView 재마운트) 없이 `ready` 직후·테마 변경 effect 에서 `__setMode` 를 주입(native: `injectJavaScript`, web: `postMessage({type:'setMode'})`)해 타일/라벨만 교체 — worklets 충돌·지도 상태 유실 방지. 같은 모드면 `__setMode` 가 no-op(깜빡임 없음). `theme.mode` 는 의도적으로 HTML-빌드 메모의 deps 에서 제외. "내 위치"(📍) 버튼은 16차대로 `pending` 만 disabled, `denied`/`unavailable` 도 클릭 가능(silent refetch → `Alert`/`openSettings`). 마커 데이터에 이미지/썸네일 없음 — `id/lat/lng/name/categoryKey` 만 운반.

### 레이어 토글 — 테마 연동 + 사용자 오버라이드

`MapLayerControl` ([MapLayerControl.tsx](../../apps/web/src/components/restaurant/MapLayerControl.tsx)) 는 좌하단 3버튼(일반/다크/위성). 기존 오버레이(재검색·전체 영역·내 위치)가 전부 상단이라 좌하단을 쓴다. `gray` 레이어도 밝은 계열이라 "일반" 탭이 active 로 보이게 매핑(`value === 'gray' && v === 'Base'`).

`MapCanvas` 의 레이어 상태머신:

- 초기값: `layerForTheme(themeMode)` — `dark→'midnight'`, 그 외 `→'Base'`.
- 테마 변경: `userPickedLayerRef.current` 가 false 일 때만 `setLayer(layerForTheme(...))` 로 따라간다.
- 사용자가 컨트롤로 직접 선택: `handlePickLayer` 가 `userPickedLayerRef = true` 로 잠가 이후 테마 변경 무시.
- 레이어 변경 적용: `tileSourceRef.current.setUrl(buildVworldTileUrl(apiKey, layer))` — **map 재생성 없이** URL 만 교체(줌/센터/마커 유지). 동시에 `vectorSourceRef.current.changed()` 로 라벨 색 재평가. 첫 렌더는 `layerInitRef` 가드로 건너뛴다(같은 URL 로 `setUrl` 하면 OL 이 타일을 통째 리프레시해 깜빡임).
- 어두운 베이스(`midnight`/`Satellite`)에서는 마커 라벨을 반전: fill `#f8fafc` + stroke `#0f172a`(어두운 외곽선). 밝은 맵은 기존 fill `#0f172a` + stroke `#fff`. `isDarkBaseRef` 가 style function 평가 시점에 읽는다.

### 마커 스타일 — variant + categoryKey 통합 빌더

`MapCanvas` 의 `MapMarker` 는 색 분기(`variant`)와 카테고리 분기(`categoryKey`) 두 축을 동시에 받는다.

```ts
interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  variant?: 'primary' | 'muted';                    // 빨강 / 회색
  categoryKey?: RestaurantCategoryKey | null;       // 8 카테고리 또는 null(generic)
}
```

실제 SVG 는 모두 [packages/utils/src/restaurantCategory.ts](../../packages/utils/src/restaurantCategory.ts) 의 `buildRestaurantMarkerSvg(key, selected, variant)` 가 그린다 — 비선택은 26×26 원(중심 앵커) + 안쪽 카테고리 아이콘, 선택은 32×48 핀(꼭지점 앵커) + 같은 안쪽 아이콘. variant 는 외곽 채움 색만 결정한다.

| 축 | 값 | 의미 | 시각 효과 |
|---|---|---|---|
| variant | primary | 기본/검색 결과 | 빨강 `#ef4444` (base) / `#dc2626` (selected) |
| variant | muted | 이미 등록된 항목 | 회색 `#94a3b8` (base) / `#64748b` (selected) |
| categoryKey | korean/japanese/chinese/cafe/dessert/bar/western/snack | 정규화된 8 카테고리 | 안쪽 흰 라인 아이콘 (그릇·물고기·만두·커피잔·케이크·맥주잔·포크나이프·꼬치) |
| categoryKey | null | 매칭 실패 | generic 식기(포크+나이프) — 위화감 회피용 |
| selected | true/false | 현재 선택 여부 | 핀 ↔ 원 + 색 톤 한 단계 |

라벨 색은 위 마커 색과 별개로 **베이스맵 밝기**에 따라 반전된다(위 "레이어 토글" 참고).

`MapCanvas` 는 컨테이너 사이즈 변화를 자체 감지한다. `ResizeObserver` 가 `containerRef` 를 관찰하다가 변동 시 `map.updateSize()` 를 자동 호출, cleanup 에서 `disconnect()`. OpenLayers 는 컨테이너 reflow 를 자체 감지 안 해 호출자가 명시적 `updateSize()` 를 안 부르면 패널 토글 직후 지도가 일그러질 수 있는데, 이걸 컴포넌트 레벨에서 한 번에 흡수한다.

### 줌 임계값 — 라벨만 토글, 핀은 축소

웹 `MapCanvas` 의 vector layer 는 declutter 를 **끔**. 대신 style function 안에서 줌을 직접 읽어 분기한다:

- `selected === true` : 항상 풀사이즈 핀 + 라벨
- `zoom >= LABEL_VISIBLE_ZOOM (14)` : 풀사이즈 핀 + 라벨
- `zoom <  LABEL_VISIBLE_ZOOM (14)` : `SMALL_ICON_SCALE (0.55)` 배율 축소 핀 + 라벨 없음

이렇게 두면 줌 아웃 시 라벨이 핀과 함께 declutter 되어 사라지는 회귀가 일어나지 않는다.

앱 측 [publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts) 는 동일 의도지만 구현이 약간 다르다 — `VectorLayer({ declutter: true })` 를 유지하면서 모든 마커에 라벨을 박고, 도심 밀집에서 글자 충돌만 OL 이 자동 숨김. 웹은 줌 임계값으로 핀 축소, 앱은 라벨 충돌을 OL declutter 로 흡수 — 둘 다 "줌 아웃 시 핀이 사라지지 않는다" 는 같은 결과.

### 타일 에러 — probe 판정 (오탐 방지)

**(2026-06, 18차)** `tileloaderror` 는 키 거부와 동의어가 아니다. 실측상 대부분의 타일 실패는 클라이언트 측 일시적 실패 — 빠른 패닝/줌으로 대량 타일을 동시 요청하면 브라우저가 리소스/커넥션 한계로 `net::ERR_INSUFFICIENT_RESOURCES` 등으로 이미지 로드를 실패시키고(서버는 정상, 같은 타일 재fetch 시 200), OL 이미지 abort 도 마찬가지다. 따라서 단순 실패 카운트로 "키 무효" 배너를 띄우면 오탐이 잦았다.

`MapCanvas` 의 전략:

- `tileloaderror` 마다 `consecutiveErrors += 1`. `tileloadend`(타일 1장 성공) 시 0 으로 리셋 + 배너 해제.
- `consecutiveErrors >= FAIL_THRESHOLD(8)` 이고 쿨다운(`PROBE_COOLDOWN_MS=5000`)이 지났으면 즉시 배너 대신 **키를 직접 probe** — `buildVworldTileUrl(apiKey,'Base')` 템플릿의 `{z}/{y}/{x}` 를 `7/44/109`(서울 부근 저줌 단일 타일)로 치환해 `fetch`(4s 타임아웃 AbortController).
- probe 결과 3분기: **401/403**(서버가 키 명시 거부) → 배너 표시. **200 + `content-type: image/*`** → `consecutiveErrors=0` + 배너 억제/해제(일시적 실패였음). **그 외(throw·타임아웃·비이미지·기타 status)** → 판정 불가, 상태 유지. probe fetch 자체의 throw 를 "무효"로 안 보는 게 핵심 — 오탐 회피.
- 콜백 시그니처가 `onTileError(hasError: boolean)` 로 바뀌어 표시뿐 아니라 해제도 전달. `setReported` 가 직전 보고 상태와 다를 때만 콜백을 쏴 중복 토글을 막는다.

### 모바일 (WebView/iframe) 동형 코어

[publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts) 은 빌드 시점에 18개(8 카테고리 + generic, 각 선택/비선택) data URL 을 미리 만들어 HTML 의 `ICONS` 객체에 inject. 런타임은 `ICONS[catKey] || ICONS['_']` 한 줄 lookup. RN ↔ Web 채널은 `__setMarkers` / `__setSelected` / `__setMode` / `__flyTo` 함수로 분리 — selection 변경이 vectorSource clear + N개 feature 재생성을 일으키지 않도록 selection 채널을 떼어내 `prev/next` 두 setStyle 만 수행한다.

**(2026-06)** 다크 타일 지원이 들어왔다. `buildPublicRestaurantsMapHtml(apiKey, initialCenter, mode)` 가 `BASE_TILE_URL`(`Base`)·`DARK_TILE_URL`(`midnight`) 둘을 HTML 에 inject 하고 `darkBg` 부울로 시작 레이어/배경/라벨색을 결정한다. 런타임 전환은 신규 `window.__setMode(mode)` — `mode === 'dark'` 여부가 현재 `darkBg` 와 같으면 no-op(타일 깜빡임 방지), 다르면 `tileSource.setUrl(...)` + body 배경(`#09090b`↔`#f4f4f5`) + 모든 마커 라벨 재칠(선택 상태 보존). web iframe 은 `message` 리스너에 `type:'setMode'` 분기를 추가했다. native 는 `injectJavaScript` 로 `__setMode` 를 직접 호출.

키 저장은 `MapProviderConfig` 테이블 단일. AI 키와 같은 패턴이지만 모델/동시성 같은 LLM 옵션이 없어 더 단순 — `provider` 유니크 키 + `apiKey` 평문 + `domains` 자유 메모 + `updatedAt`/`updatedById`.

라우트는 admin 보호 4개 + 공개 1개로 분리 ([apps/friendly/src/modules/settings/map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)):

```
GET    /api/v1/admin/settings/map              -- list + 합성 빈 행 (vworld)
PUT    /api/v1/admin/settings/map/:id          -- upsert (apiKey 빈문자열은 무시)
DELETE /api/v1/admin/settings/map/:id          -- 행 삭제
GET    /api/v1/admin/settings/map/:id/secret   -- 평문 키 (admin 가드)
GET    /api/v1/settings/map/public             -- 평문 키 (공개; 미등록 시 404)
```

URL helper 는 `Routes.SettingsMap` ([packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)) 한 자리에서 정의.

지원 provider 는 zod enum `MapProviderId = z.enum(['vworld'])` ([packages/api-contract/src/schemas/settings-map.ts](../../packages/api-contract/src/schemas/settings-map.ts)) — 카카오/네이버 추가 시 enum 만 늘리면 된다. `MapSettingsService.list()` 가 `known = ['vworld']` 상수를 들고 있어 row 가 없어도 빈 카드 한 장은 늘 응답에 들어간다.

## Talks To [coverage: high -- 11 sources]

- **friendly DB (`MapProviderConfig`)** -- 평문 키 1행 저장. AI 와 달리 env fallback 없음 ([map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts) line 11-13).
- **vworld API CDN (`https://api.vworld.kr/req/wmts/1.0.0/`)** -- 직접 타일만 호출. JS SDK (`vw.ol3.Map`) 는 안 쓴다 — SDK 는 init URL 도메인 화이트리스트 검증이 fragile. WMTS 직접 호출은 키만 검증 ([packages/utils/src/vworld.ts](../../packages/utils/src/vworld.ts)). LAYER 는 `Base`/`gray`/`midnight`/`Satellite`/`Hybrid` 중 현재 `Base`/`midnight`/`Satellite` 3종을 컨트롤로 노출.
- **`@repo/utils` (`vworld.ts`)** -- `VworldLayer` 타입, `buildVworldTileUrl(apiKey, layer)`, `probeVworldKey`. **(주의)** 타일 URL 빌더는 옛 `apps/web/src/lib/vworld.ts` 가 아니라 이제 `packages/utils` 에 있다(웹·앱 공용). 웹 측에는 `apps/web/src/lib/vworld.js`(레거시) 만 남아 있다.
- **`@repo/utils` (`restaurantCategory.ts`)** -- `resolveRestaurantCategoryKey`, `buildRestaurantMarkerSvg`, `buildRestaurantMarkerDataUrl`, `RESTAURANT_CATEGORY_KEYS`. 자유 텍스트 카테고리 → 8키 정규화 + 마커 SVG 빌더를 한 자리에.
- **`apps/web` theme store (`useThemeStore`)** -- **(2026-06 신규)** `MapCanvas` 가 `useThemeStore((s) => s.mode)` 로 초기 레이어를 결정하고 테마 변경을 구독([apps/web/src/stores/theme.ts](../../apps/web/src/stores/theme.ts)). 앱 측은 `@repo/shared` 의 `useTheme()` 로 동등한 `theme.mode` 를 받는다.
- **shared (`settingsMapApi`, `useSettingsMap`)** -- `list/update/remove/getSecret/publicConfig` API + 동명 React Query hooks ([useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts)).
- **shared (`useUserLocation` / `useUserLocationNative`)** -- `MyLocationButton`(웹)·앱 "내 위치" 버튼이 `UserLocationStatus`(`pending`/`granted`/`denied`/`unavailable`) 를 받아 분기. 상세는 [shared](shared.md).
- **admin UI** -- `AdminSettingsPage` 탭 컨테이너, `AdminMapKeysPage` provider 카드 + 폼 + 연결 테스트, `AdminLayout` sidebar "설정" 진입점.
- **admin restaurant detail** -- `AdminRestaurantDetailPage` 우측 280px 사이드 카드 + Maximize2 → Radix Dialog 우측 슬라이드오버(740px)에 별도 `VWorldMap`. 한 OL Map 을 setTarget 으로 옮기는 트릭은 안 쓴다 ([AdminRestaurantDetailPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx)).
- **public restaurants page / admin discover page** -- `RestaurantsPage`(`/restaurants`) → `PublicRestaurantsMap`, `AdminDiscoverPage`(`/admin/discover`) → `DiscoverMap` 가 검색(`primary`) + 등록(`muted`) 합성, 같은 placeId 는 muted 우선.
- **admin 지역 통계 위젯 / `RegionStatsResult`** -- **(2026-06 신규)** `RegionStatsMap` 이 `RegionStatsResultType`([api-contract](../../packages/api-contract/src/schemas))의 `sidos[].sigungus[]`(centroid+count, 버블/색칠 라벨)와 `points[]`(좌표 보유 가게, 마커 + choropleth point-in-polygon)를 입력으로 받는다. 통계 산출(`computeRegionStats`)·운영·텔레그램 발송은 [friendly](friendly.md)·[telegram](telegram.md) 토픽 — 여기서는 그 결과를 지도 위에 렌더하는 책임만. 경계 에셋 [public/sigungu-geo.json](../../apps/web/public/sigungu-geo.json)(2018 KOSTAT 시군구, mapshaper 4% 단순화, 552KB/gz 120KB)은 색칠 모드 진입 시에만 지연 fetch.

## API Surface [coverage: high -- 7 sources]

**HTTP — admin (인증 + ADMIN 가드, [map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)):**

- `GET Routes.SettingsMap.list` → `{ providers: MapProviderConfig[] }`. 등록 row 가 없어도 `vworld` 한 장이 합성된 빈 카드(`hasApiKey: false`, `apiKeyMasked: null`).
- `PUT Routes.SettingsMap.provider(:id)` body=`UpdateMapProviderInput` → `MapProviderConfig`.
  - `apiKey?: string` — 빈/생략은 보존. 첫 등록인데 키가 비면 `400 API 키가 필요합니다`.
  - `domains?: string|null` — `undefined` 보존 / `null` 클리어 / 문자열 set.
- `DELETE Routes.SettingsMap.provider(:id)` → 204 (idempotent).
- `GET Routes.SettingsMap.secret(:id)` → `{ provider, apiKey: string|null, domains: string|null }`. admin 가드 통과 후 평문.

**HTTP — public (인증 없음):**

- `GET Routes.SettingsMap.publicConfig` → `{ provider: 'vworld', apiKey: string }`. 미등록이면 `404 지도 키가 등록되지 않았습니다`. 호출자가 `ApiError.statusCode === 404` 로 분기해 placeholder.

**Zod 계약 ([settings-map.ts](../../packages/api-contract/src/schemas/settings-map.ts)):**

| Schema | 형태 |
|---|---|
| `MapProviderId` | `z.enum(['vworld'])` |
| `MapProviderConfig` | `{ provider, hasApiKey, apiKeyMasked, domains, updatedAt }` (기본 GET — 마스킹된 키) |
| `MapProviderSecret` | `{ provider, apiKey: nullable, domains: nullable }` (admin 평문) |
| `MapProviderPublicConfig` | `{ provider, apiKey: string }` (공개 평문, 미등록 시 라우트 404) |
| `UpdateMapProviderInput` | `{ apiKey?: string, domains?: string\|null }` |

**FE hooks ([useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts)):**

- `useMapProviders()` — `['settings', 'map', 'providers']`.
- `useUpdateMapProvider()` / `useDeleteMapProvider()` — onSuccess 시 providers + secret 캐시 둘 다 invalidate.
- `useMapProviderSecret(id, enabled=true)` — `staleTime/gcTime: Infinity`. `enabled` 로 좌표 없는 카드에서 secret 호출 차단.
- `useMapPublicConfig(enabled=true)` — 무한 캐시 + `retry: false`(404 는 정상 상태).

**`MapCanvas` props ([MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx)):**

```ts
interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  variant?: 'primary' | 'muted';                         // 'primary' default — 빨강 핀.
  categoryKey?: RestaurantCategoryKey | null;            // 8 카테고리 또는 null(generic 식기).
}
interface Props {
  apiKey: string;
  markers: MapMarker[];
  selectedMarkerId?: string | null;
  initialCenter?: { lat: number; lng: number; zoom?: number };
  onMarkerSelect?(markerId: string): void;
  onViewportChangeEnd?(viewport: MapViewport): void;     // 사용자 패닝/줌 종료 — programmatic 무시
  onViewportSync?(viewport: MapViewport): void;          // 모든 viewport 변경 (첫 렌더 포함)
  onTileError?(hasError: boolean): void;                 // (18차) 연속 실패 임계+probe 판정 → 표시(true)/해제(false)
  layerControl?: boolean;                                // 좌하단 레이어 토글(일반/다크/위성). 기본 true.
  className?: string;
}
interface MapCanvasHandle {
  flyTo(lat: number, lng: number, zoom?: number): void;
  // flyTo 와 같지만 최소 minZoom 까지 확대(이미 더 확대면 줌 유지, 줌아웃 안 함).
  // 카드 더블클릭 "확대" 에 사용.
  flyToZoomIn(lat: number, lng: number, minZoom: number): void;
  fitToMarkers(padding?: number): void;
}
interface MapViewport {
  centerLng: number; centerLat: number; zoom: number;
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number };
}
```

**`MyLocationButton` props ([MyLocationButton.tsx](../../apps/web/src/components/restaurant/MyLocationButton.tsx)) — 신규 공용:**

```ts
interface Props {
  status: UserLocationStatus;   // pending/granted/denied/unavailable
  onClick: () => void;          // refetch 트리거
}
```
`pending` 만 disabled. `denied`(권한 차단)·`insecure`(`window.isSecureContext === false`) 는 클릭 시 해제 방법 callout 토글. `insecure` 외에는 `onClick()`(refetch) 도 같이 건다 — `denied` 도 사용자가 이미 설정을 풀어뒀을 수 있어 한 번 확인. 바깥 클릭으로 callout 닫기는 `document` mousedown 구독.

**`PublicRestaurantsMap` / `DiscoverMap` 의 줌 상수:**

- `ZOOM_IN_LEVEL = 17` — 더블클릭 "확대" 목표(양쪽 동일, `fitToMarkers` maxZoom 과 통일).
- `MY_LOCATION_ZOOM = 16` (DiscoverMap) — "내 위치" 도착 동네 수준. 공개 지도는 첫 도착/재요청을 같은 `flyTo` 경로로 처리.

**`VWorldMap` props ([VWorldMap.tsx](../../apps/web/src/components/restaurant/VWorldMap.tsx)):**

```ts
interface Props {
  lat: number | null;
  lng: number | null;
  name: string;          // 마커 라벨 + Dialog 타이틀
  className?: string;    // 기본 'h-[280px] w-full'
}
```

**카테고리 → 아이콘 빌더 ([restaurantCategory.ts](../../packages/utils/src/restaurantCategory.ts)):**

```ts
export const RESTAURANT_CATEGORY_KEYS = [
  'korean', 'japanese', 'chinese', 'cafe',
  'dessert', 'bar', 'western', 'snack',
] as const;
export type RestaurantCategoryKey = (typeof RESTAURANT_CATEGORY_KEYS)[number];
export type RestaurantMarkerVariant = 'primary' | 'muted';

export function resolveRestaurantCategoryKey(
  category: string | null | undefined,
): RestaurantCategoryKey | null;

export function buildRestaurantMarkerSvg(
  key: RestaurantCategoryKey | null,
  selected: boolean,
  variant?: RestaurantMarkerVariant,  // default 'primary'
): string;

export function buildRestaurantMarkerDataUrl(
  key: RestaurantCategoryKey | null,
  selected: boolean,
  variant?: RestaurantMarkerVariant,
): string;
```

키워드 우선순위 (`KEYWORD_TABLE`): `bar`(1) > `dessert`(2) > `cafe`(3) > `japanese`(4) > `chinese`(5) > `western`(6) > `snack`(7) > `korean`(8). `bar > dessert > cafe` 순서가 핵심 — "이자카야 > 술집" 은 술집 의미가, "디저트카페" 는 디저트가 더 두드러진다.

**vworld 타일 빌더 ([packages/utils/src/vworld.ts](../../packages/utils/src/vworld.ts)):**

```ts
export type VworldLayer = 'Base' | 'gray' | 'midnight' | 'Satellite' | 'Hybrid';
export const buildVworldTileUrl = (apiKey: string, layer: VworldLayer = 'Base'): string =>
  `https://api.vworld.kr/req/wmts/1.0.0/${apiKey}/${layer}/{z}/{y}/{x}.png`;
export const probeVworldKey = async (apiKey: string): Promise<boolean>;  // Base/7/44/109.png 한 장 fetch
```

`probeVworldKey` 는 `WMTS/{KEY}/Base/7/44/109.png` 한 장 fetch, `200` + `content-type: image/*` 면 OK. 어드민 "연결 테스트" 가 호출.

## Data [coverage: high -- 3 sources]

`MapProviderConfig` ([schema.prisma](../../apps/friendly/prisma/schema.prisma), [migration](../../apps/friendly/prisma/migrations/20260508173216_add_map_provider_configs/migration.sql)):

```
id          String   @id @default(cuid())
provider    String   @unique     -- 'vworld' (현재). 카카오/네이버 추가 가능성.
apiKey      String                -- 평문. admin secret + public 라우트 모두 그대로 반환.
domains     String?               -- vworld 콘솔 도메인 화이트리스트 메모. 콤마 구분 자유 입력.
                                     서버는 검증 안 함 — UI 카드의 운영자 메모용.
updatedAt   DateTime @updatedAt
updatedById String?               -- 마지막 수정 admin user id (감사 로그).
```

`provider` 유니크 — 한 provider 당 한 행. `MapSettingsService.list` 가 `known = ['vworld']` 로 빈 행을 합성하므로 DB 가 비어 있어도 어드민 화면이 안 깨진다. `apiKeyMasked` 는 GET 응답 가공용(`maskApiKey` 재사용 — 앞 4 + `***` + 뒤 4). 평문 키는 secret/publicConfig 라우트로만. env fallback 없음.

레이어 선택은 DB 에 저장되지 않는다 — 클라이언트 state(테마 연동 초기값 + 세션 내 사용자 오버라이드)일 뿐. 새로고침하면 다시 테마를 따른다.

## Key Decisions [coverage: high -- 18 sources]

- **18차(2026-06): 지역 통계 choropleth 지도 — `MapCanvas` 분기 대신 별도 컴포넌트** -- 시군구 폴리곤 색칠 + 가변 사이즈 버블은 `MapCanvas` 의 마커 빌더(고정 SVG 핀)와 모델이 안 맞아, 타일/테마/키 헬퍼만 공유하고 OL `Map` 을 직접 만드는 `RegionStatsMap` 으로 분리했다. 색칠 카운트는 **이름 매칭이 아니라** 가게 좌표의 point-in-polygon(`geometry.intersectsCoordinate`)으로 매겨 시군구 명칭/구·시 단위 차이를 통째로 회피한다(이름 정규화 불필요). 경계 GeoJSON(552KB)은 대용량이라 src import 시 tsc 폭주 + 메인 번들 영향을 피하려 **색칠 모드 진입 시에만 런타임 fetch** 하고 `geoCacheRef` 로 캐시(모드 토글마다 재요청 안 함).
- **18차(2026-06): vworld 타일 오류 배너를 키 직접 검사(probe)로 — 단발 실패로 굳던 회귀 수정** -- 기존엔 `tileloaderror` 1회만으로 "키 무효" 배너를 띄우고 굳었는데, 빠른 패닝/줌의 브라우저 리소스 한계 실패(서버 정상)까지 키 무효로 오판했다. 연속 실패 8회 임계를 넘을 때만 저줌 단일 타일을 `fetch` probe 해 **401/403 일 때만** 배너, 200+image 면 해제, throw·기타는 상태 유지(probe 자체의 throw 를 무효로 안 봄). 타일 1장이라도 성공하면 즉시 리셋. `onTileError(hasError)` 로 해제도 전달. 키 검증 URL 은 `buildVworldTileUrl` 템플릿 재사용(엔드포인트 중복 회피).
- **18차(2026-06): 선택 마커를 다른 마커 위로 — Style zIndex** -- 클릭 강조 핀이 인접 핀에 일부 가리던 문제를 OL Style `zIndex`(선택 1000 / 비선택 0)로 해결. `setTarget`/레이어 분리 같은 무거운 수단 대신 기존 style 재평가 경로에 zIndex 한 줄만 얹어 클릭 즉시 반영.
- **17차(2026-06): 다크(midnight)/위성 레이어 토글 + 앱 테마 연동(MapLayerControl), MyLocationButton 공용(공개+어드민 발견, denied/insecure 구분), 앱 WebView midnight 타일** -- 세 줄기. (a) 웹 `MapCanvas` 가 `MapLayerControl`(좌하단 일반/다크/위성)을 깔고 초기 레이어를 `useThemeStore.mode` 로 결정하되, 사용자가 직접 고르면 `userPickedLayerRef` 로 테마 추종을 끊는다. 레이어 변경은 `tileSource.setUrl` + 라벨 색 반전 재평가만(map 재생성 없음). (b) `PublicRestaurantsMap` 안에 있던 `MyLocationButton` 을 별 파일로 추출해 `DiscoverMap` 도 공유 — 두 화면이 같은 `denied`/`insecure` UX. (c) 앱 WebView 도 vworld 실제 `midnight` 다크 타일을 쓰고, 테마 런타임 전환은 WebView 재마운트 없이 `__setMode` 주입. CSS invert 같은 트릭을 양쪽 다 피했다.
- **17차(2026-06): 호버 패닝 제거 + 더블클릭=확대(flyToZoomIn)** -- 기존엔 카드 호버만으로 `flyTo` 가 발사돼 의도치 않은 패닝이 잦았다. 공개 지도는 `hoveredPlaceId` prop 을 떼고 `selectedPlaceId`(클릭)로만 패닝(줌 유지). 더블클릭은 신규 `zoomFocus: { placeId }` prop + `MapCanvasHandle.flyToZoomIn(lat,lng,minZoom)` 로 `ZOOM_IN_LEVEL=17` 까지 당긴다(이미 더 확대돼 있으면 줌은 유지, **줌아웃은 절대 안 함** — `Math.max(minZoom, 현재줌)`). 어드민 발견도 동일 prop 을 받는다.
- **vworld JS SDK 거부, OpenLayers + WMTS 직접** -- SDK(`vw.ol3.Map`)는 init URL 도메인 화이트리스트 매칭이라 localhost/staging/prod 마다 등록이 필요해 fragile. WMTS 직접 호출은 키만 검증. v1 도 같은 결정 — 검증 끝.
- **WMTS endpoint 형태** -- `https://api.vworld.kr/req/wmts/1.0.0/{KEY}/{LAYER}/{z}/{y}/{x}.png`. layer 는 `Base`/`gray`/`midnight`/`Satellite`/`Hybrid`. **(2026-06)** 더 이상 `Base` 고정이 아니라 `MapLayerControl` 로 `Base`/`midnight`/`Satellite` 3종을 노출하고 `tileSource.setUrl` 로 런타임 교체. 빌더 `buildVworldTileUrl` 은 `packages/utils` 로 옮겨 웹·앱 공용.
- **tile load 에러 판정 — (18차) 1회 플래그 → 연속 임계 + probe** -- 예전엔 `tileloaderror` 1회로 `errored=true` 영구 잠금이었으나, 빠른 패닝의 클라이언트 측 일시 실패(서버 정상)까지 키 무효로 오판해 배너가 굳는 회귀가 있었다. 이제 `consecutiveErrors` 카운터(타일 성공=`tileloadend` 시 0 리셋) + 임계 8 초과 시 저줌 단일 타일을 `fetch` probe → 401/403 만 배너. 한 화면 수십 장 동시 실패의 폭주는 임계 + 5s 쿨다운 + `probing` 락으로 흡수. 레이어를 `setUrl` 로 바꿔도 같은 `tileSource` 라 핸들러/카운터는 유지된다.
- **DB 저장(`MapProviderConfig`) vs env/yaml** -- 어드민에서 직접 등록·수정·삭제·테스트 가능해야 하니 `LlmProviderConfig` 패턴. env fallback 미사용 — vworld 키는 운영자가 콘솔에서 도메인과 짝지어 발급받는 1:1 자원.
- **admin secret + public 라우트 보안 등급 동등** -- 분리는 라우트 명/가드만. WMTS 키는 어차피 Network 탭에 평문 노출되는 클라이언트 자원.
- **`MapCanvas` vs `VWorldMap` 분리** -- 공개 다중 마커 + viewport 콜백 + imperative API 요구로 저레벨 `MapCanvas` 추출. `VWorldMap` 은 placeholder 분기 + admin secret hook 만 담당하는 thin wrapper.
- **imperative API (`flyTo`/`flyToZoomIn`/`fitToMarkers`)** -- `useImperativeHandle` 로 ref 메서드 노출. 카드 호버/클릭/더블클릭 → 마커 이동은 외부 시스템(OL Map) 동기화 side effect 지 derived state 가 아니다. ref + animate 가 자연스럽다.
- **사용자 vs programmatic 이동 구분** -- OL `moveend` 는 둘 다 발화. `pointerdrag` + `wheel` 에 hook 을 박아 사용자 인터랙션이 있을 때만 `userInteractedRef = true`. `flyTo`/`flyToZoomIn`/`fitToMarkers` 는 호출 직전 `userInteractedRef = false` 로 재설정해 자기 moveend 를 무시.
- **키 미등록은 placeholder** -- 공개는 `useMapPublicConfig` 404 분기, 어드민 상세는 `apiKey === null` 분기에 `Link to="/admin/settings/map"`.
- **카테고리별 라인 아이콘 — 단순 핀에서 8종 시각 분류로** -- 키워드 정규화 + 8종 라인 아이콘으로 색은 그대로 두고 안쪽 아이콘으로 분류. 자유 텍스트 매칭 우선순위가 핵심(더 좁은 의미 먼저).
- **마커 스타일 — SVG data-URL Icon 단일 빌더 (variant + categoryKey 통합)** -- variant(primary/muted) × selected × category(8 + null) = 36 조합을 하나의 `buildRestaurantMarkerSvg` 가 처리. 모바일 HTML 은 빌드 시점에 18개(공개 페이지는 muted 미사용) data URL 을 미리 inject.
- **`MapMarker.variant` 로 marker 색 분기 — 어드민 발견 검색·등록 통합 마커** -- 검색(빨강 primary) + 등록(회색 muted) 을 한 layer 에 합성, 같은 placeId 는 muted 우선해 중복 크롤 방지.
- **`VectorLayer` declutter 해제 + 줌 임계값 라벨 토글 (줌 아웃 마커 누락 수정)** -- OL declutter 는 feature 단위(이미지+라벨)라 라벨 충돌 시 핀까지 가린다. 웹은 declutter 끄고 `zoom < 14` 면 라벨 빼고 핀 `0.55` 축소. 모바일 HTML 은 declutter 켜서 라벨만 자동 숨김 — 마우스 호버 vs 터치 모델 차이로 선택을 다르게 갔다.
- **ResizeObserver 자동 reflow — `map.updateSize()` 분산 호출 회피** -- OL 은 컨테이너 사이즈 변화를 자체 감지 안 해 `updateSize()` 명시 호출 필요. `MapCanvas` 가 `ResizeObserver` 로 자동 처리, cleanup 에서 `disconnect()`. **(2026-06 주의)** OL 타깃 div 를 레이어 컨트롤 오버레이를 위해 `absolute inset-0` 으로 감쌌으나 `containerRef` 는 여전히 그 내부 div 라 ResizeObserver 동작 동일.

## Gotchas [coverage: high -- 15 sources]

- **레이어 변경 첫 렌더 skip — `layerInitRef` 가드** -- map-create effect 가 이미 `layerRef.current` 로 올바른 타일을 만들었으므로, layer effect 의 첫 실행은 `setUrl` 을 건너뛴다. 같은 URL 로 `setUrl` 하면 OL 이 타일을 통째 리프레시해 깜빡인다. layer effect 를 손볼 때 이 가드를 깨면 첫 렌더 깜빡임 회귀.
- **테마-레이어 추종은 사용자가 직접 고르기 전까지만** -- `userPickedLayerRef` 가 true 가 되면 테마 변경 effect 가 `return` 으로 빠진다. 다크모드 토글 시 지도가 안 따라온다면 그 세션에서 이미 컨트롤을 눌렀기 때문 — 의도된 동작. 새로고침하면 다시 테마를 따른다(레이어는 비영속).
- **앱 WebView `__setMode` no-op 가드** -- `ready` 직후 첫 `__setMode` 호출은 초기 HTML 이 이미 그 모드로 빌드돼 있어 `nextDark === darkBg` 라 no-op(깜빡임 없음). `theme.mode` 를 HTML-빌드 메모의 deps 에 넣으면 모드 변경마다 WebView 가 재마운트되어 worklets 충돌 + 지도 상태 유실 — 의도적으로 deps 에서 제외했다. 새 런타임 채널을 추가할 때 같은 분리 유지.
- **다크 배경 라벨 반전** -- `midnight`/`Satellite`(=`isDarkBaseLayer`) 위에서는 라벨 fill `#f8fafc` + stroke `#0f172a`. 새 어두운 레이어를 추가하면 `isDarkBaseLayer` 에도 넣어야 라벨이 안 묻힌다. 앱 HTML 은 `darkBg` 부울 + `__setMode` 가 같은 역할.
- **JS SDK 회귀 시 도메인 화이트리스트 부활** -- `vw.ol3.Map` 으로 되돌리면 콘솔 등록 도메인과 init URL host 가 정확히 일치해야 한다. WMTS 직접 호출이 이 부담을 통째로 뺀다.
- **(18차 갱신) `tileloaderror` 는 더 이상 1회 플래그가 아니다 — 연속 8회 + probe** -- 예전엔 첫 에러로 `errored=true` 영구 잠금이었지만, 그게 빠른 패닝의 일시적 실패까지 키 무효로 굳혀 회귀를 냈다. 이제 `consecutiveErrors` 카운터 + `tileloadend` 리셋 + 임계(8) 초과 시 키 probe 로 판정한다. 따라서 키가 정상이면 타일이 한 장만 성공해도 배너가 자동 해제된다. probe 가 401/403 을 받기 전까진 배너가 안 뜬다 — "키 바꿨는데 배너가 안 뜬다/안 사라진다" 면 probe 결과(저줌 z7 단일 타일)를 Network 탭에서 확인. `setUrl`(레이어 변경)은 같은 `tileSource` 라 핸들러/카운터가 유지된다.
- **programmatic 이동이 user 이동으로 잘못 분류되면 무한 재검색** -- 카드 클릭 → fly → moveend → 재검색 → URL 갱신 → 새로고침 → 또 fly … 무한 루프. `flyTo`/`flyToZoomIn`/`fitToMarkers` 가 호출 직전 `userInteractedRef = false` 로 강제 리셋하는 게 핵심. 새 imperative 메서드 추가 시 같은 패턴 필수.
- **declutter off → 핀 겹침은 라벨/스케일로만 회피** -- 웹 `MapCanvas` 가 declutter 를 꺼 줌 아웃 시 핀이 안 사라지지만 핀끼리 겹칠 수 있다. `LABEL_VISIBLE_ZOOM` 미만에서 라벨 끄고 핀 0.55 축소로 충돌 면적만 줄인다. 도심 밀집이 더 심해지면 클러스터링 검토.
- **더블클릭 확대는 줌아웃 안 함** -- `flyToZoomIn` 은 `Math.max(minZoom, 현재줌)` 이라 이미 17 보다 더 확대돼 있으면 중심만 옮기고 줌은 유지한다. "확대" 의미상 줌아웃은 안 일어나야 한다 — minZoom 의미로 쓸 것.
- **카테고리 매핑 누락 시 generic 식기 fallback** -- `resolveRestaurantCategoryKey` 매칭 실패 → `null` → generic 식기 아이콘(빈 핀 아님). 새 키워드가 자주 나오면 `KEYWORD_TABLE` 에 추가(더 좁은 의미 위쪽).
- **카테고리 우선순위 — bar > dessert > cafe …** -- 의도된 순서. 바꾸면 같은 식당이 다른 아이콘으로 표시되어 혼란.
- **모바일 HTML 18개 아이콘 + 다크/일반 타일 URL 둘 다 inline** -- HTML 페이로드가 약 20KB+ 무거워진다. WebView/iframe 한 번 mount 후엔 무관 — `initialHtmlRef` 캐시(`apiKey` 변경 시에만 재빌드)가 지워지지 않게 주의. 모드 변경은 재빌드가 아니라 `__setMode` 로 처리하는 게 worklets 충돌 회피 핵심.
- **평문 키 노출은 의도** -- 어드민 secret · public publicConfig 모두 평문. WMTS 호출이 클라이언트에서 일어나기 때문. 라우트 분리는 admin guard vs 비로그인 분리일 뿐.
- **선택된 마커만 풀라벨, 비선택은 줌 의존** -- 웹: `selected || zoom >= 14` 일 때만 라벨. 모바일 HTML: 라벨 항상 그리되 declutter 가 충돌 시 숨김. **(2026-06)** 호버로는 라벨도 패닝도 안 한다 — 클릭(select) 으로만 라벨/패닝, 더블클릭으로 확대.
- **`MyLocationButton` 의 stale `denied` 와 silent refetch** -- 사용자가 OS/브라우저 설정에서 권한을 다시 켜도 `status` 가 stale 할 수 있다. 클릭 시 `insecure` 외에는 무조건 `onClick()`(refetch) 을 걸어 권한이 풀렸으면 즉시 `granted` 로 전환. **stale 상태로 버튼을 disable 하지 말 것** — `pending` 만 disable, `denied`/`unavailable` 은 클릭 가능해야 회복 경로가 생긴다. 웹은 `MyLocationButton.tsx`, 앱은 `useUserLocationNative` + `Alert`/`openSettings` 경로. 상세 상태머신은 [shared](shared.md).
- **`DiscoverMap` "내 위치" 는 검색 bbox 를 안 건드림** -- 버튼 클릭으로 들어온 `focusCoord` 로 `MY_LOCATION_ZOOM=16` fly 만 하고 검색 영역은 그대로 둔다. 이후 사용자가 검색하면 `onViewportSync` 가 잡은 현재 영역으로 떨어진다(공개 지도와 다른 어드민 워크플로 — 첫 진입 자동 도착 없음, 등록 마커 fit 우선).
- **첫 등록인데 apiKey 빈 PUT 은 거절** -- env fallback 이 없어 빈 행은 "키 없음" 과 동일. `update()` 가 `existing` 없고 `apiKey` 도 비면 `apiKey is required for first registration` → 라우트 400.
- **DELETE 후 어드민 카드 즉시 갱신** -- `useDeleteMapProvider` onSuccess 가 providers + secret 캐시 둘 다 invalidate.
- **(18차) choropleth 경계 GeoJSON 은 src import 금지 — 런타임 fetch** -- `sigungu-geo.json`(552KB)을 `import` 하면 tsc 타입체크가 거대 JSON literal 에 폭주하고 메인 번들이 부푼다. 색칠 모드 진입 시에만 `${BASE_URL}sigungu-geo.json` 으로 fetch 하고 `geoCacheRef` 에 캐시(모드 토글 재요청 방지). 경로가 `BASE_URL` 기준이라 서브패스 배포에서도 깨지지 않게 해야 한다.
- **(18차) choropleth 카운트는 좌표 기준 — 이름 매칭 아님** -- 시군구별 가게 수는 `RegionStatsResult.points` 의 가게 좌표를 각 폴리곤에 `geometry.intersectsCoordinate` 로 떨궈 센다. `sidos[].sigungus[].count`(통계 산출 측 집계)와는 **다른 경로**라 경계 밖(좌표 누락/오류) 가게는 색칠에 안 잡힐 수 있다 — 버블/마커는 centroid·point 를 쓰므로 세 모드 카운트가 미세하게 어긋날 수 있음(의도된 트레이드오프, 이름/행정구역 단위 차이 회피가 우선).
- **(18차) `RegionStatsMap` 은 `MapCanvas` 와 별개 — 코어 변경 시 양쪽 다 손봐야** -- 타일/테마 헬퍼만 공유할 뿐 OL 구성·레이어 교체·테마 effect 가 `RegionStatsMap` 안에 독립 복제돼 있다. `buildVworldTileUrl`/`layerForTheme` 시그니처를 바꾸거나 새 레이어를 추가하면 `MapCanvas` 와 `RegionStatsMap` 두 곳을 같이 고쳐야 한다(공유 빌더는 같지만 effect 는 미공유).
- **단일 슬라이드오버는 별도 인스턴스** -- 어드민 식당 상세 280px 카드와 풀 슬라이드오버는 각각 별도 `VWorldMap`(=별도 OL Map). `setTarget` 이동 트릭은 view/layer 상태가 어색해져 안 쓴다.

## Sources [coverage: high -- 26 sources]

- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)
- [apps/friendly/prisma/migrations/20260508173216_add_map_provider_configs/migration.sql](../../apps/friendly/prisma/migrations/20260508173216_add_map_provider_configs/migration.sql)
- [apps/friendly/src/modules/settings/map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts)
- [apps/friendly/src/modules/settings/map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)
- [apps/friendly/src/modules/settings/map.test.ts](../../apps/friendly/src/modules/settings/map.test.ts)
- [packages/api-contract/src/schemas/settings-map.ts](../../packages/api-contract/src/schemas/settings-map.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
- [packages/shared/src/api/settings-map.api.ts](../../packages/shared/src/api/settings-map.api.ts)
- [packages/shared/src/hooks/useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts)
- [packages/utils/src/restaurantCategory.ts](../../packages/utils/src/restaurantCategory.ts)
- [packages/utils/src/vworld.ts](../../packages/utils/src/vworld.ts) — *VworldLayer / buildVworldTileUrl / probeVworldKey (lib 에서 utils 로 공용화)*
- [apps/web/src/stores/theme.ts](../../apps/web/src/stores/theme.ts) — *17차: MapCanvas 초기 레이어 결정 + 테마 추종*
- [apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) — *modified (18차): tileloaderror 연속 임계+키 probe 판정, 선택 마커 zIndex / (17차): 레이어 토글 + flyToZoomIn + 다크 라벨 반전 + 컨테이너 wrapper 분리*
- [apps/web/src/components/admin/RegionStatsMap.tsx](../../apps/web/src/components/admin/RegionStatsMap.tsx) — *new (18차): 지역 통계 choropleth/버블/마커 지도 — MapCanvas 비경유 별도 OL Map, point-in-polygon 색칠*
- [apps/web/public/sigungu-geo.json](../../apps/web/public/sigungu-geo.json) — *new (18차): 시군구 경계 GeoJSON 에셋(2018 KOSTAT, mapshaper 4% 단순화, 552KB) — choropleth 지연 fetch*
- [apps/web/src/components/restaurant/MapLayerControl.tsx](../../apps/web/src/components/restaurant/MapLayerControl.tsx) — *new (17차): 좌하단 일반/다크/위성 토글*
- [apps/web/src/components/restaurant/MyLocationButton.tsx](../../apps/web/src/components/restaurant/MyLocationButton.tsx) — *new (17차): 공개+어드민 발견 공용 내 위치 버튼(denied/insecure 구분)*
- [apps/web/src/components/restaurant/VWorldMap.tsx](../../apps/web/src/components/restaurant/VWorldMap.tsx)
- [apps/web/src/components/restaurant/PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx) — *modified (17차): MyLocationButton 추출, hoveredPlaceId 제거, zoomFocus 더블클릭 확대*
- [apps/web/src/components/admin/discover/DiscoverMap.tsx](../../apps/web/src/components/admin/discover/DiscoverMap.tsx) — *modified (17차): MyLocationButton/focusCoord/zoomFocus 도입(MY_LOCATION_ZOOM 16)*
- [apps/web/src/routes/admin/AdminSettingsPage.tsx](../../apps/web/src/routes/admin/AdminSettingsPage.tsx)
- [apps/web/src/routes/admin/AdminMapKeysPage.tsx](../../apps/web/src/routes/admin/AdminMapKeysPage.tsx)
- [apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx)
- [apps/mobile/src/components/PublicRestaurantsWebMap.native.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.native.tsx) — *modified (17차): theme.mode → __setMode 주입(다크 타일), tileError 토스트 surface 배경*
- [apps/mobile/src/components/PublicRestaurantsWebMap.web.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.web.tsx) — *modified (17차): theme.mode → postMessage(setMode)*
- [apps/mobile/src/components/publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts) — *modified (17차): mode 인자 + BASE/DARK 타일 URL + window.__setMode + 다크 배경/라벨 반전*
