---
topic: map
type: codebase
last_compiled: 2026-08-30
sources_count: 44
status: active
aliases: [muted-marker, gray-pin, map-resize-observer, discover-map, registered-vs-search-marker, webview-vworld, fly-to-zoom, marker-fly, selected-marker-pin, label-always-visible, location-fly-bbox, public-restaurants-webview-map, line-icon, category-icon, restaurant-category-icon, declutter, zoom-label, compact-marker, generic-fork-knife-icon, my-location-button, geolocation-guide, insecure-context, native-location-permission-ux, open-settings-alert, map-layer-control, dark-tile, midnight-layer, satellite-layer, theme-linked-map, fly-to-zoom-in, double-click-zoom, set-mode-webview, choropleth, sigungu-geo, region-stats-map, point-in-polygon, vworld-tile-probe, tile-error-probe, selected-marker-zindex, map-instance-pool, pooled-map, poolKey, take-semantics, tab-switch-flash, transit-desktop-mobile, overlay-markers, fit-excluded-layer, transit-map-viewport, AirStationsMap, 측정소-지도, air-marker, airMarker, LifeMapView, 일상지도-지도, lifeMapMarker, lifeMapMarkers, cell-bubble, 셀-버블, cctv-dot, fixedScale, fixed-scale-marker, marker-style-cache, markerStyleCache, MapMarker.icon, icon-injection, markerFrame, buildCircleMarkerSvg, buildPinMarkerSvg, bottomInset, centerWithBottomInset, map-bottom-inset, sheetHalfInset, TransitMapView, transitMapHtml, transitMapBridge, marker-icons-dictionary, 아이콘-사전, AirStationsMapCard, lifeMapBridgeMarkers, poolKey-air, poolKey-life, timeout-status]
---

# map — vworld 타일 + OpenLayers 지도 인프라(웹 MapCanvas·앱 WebView 코어·키 설정)

**2026-08-17~08-30 변경 흡수 — 지도 소비처 확장(대기 측정소·일상지도) + 마커 스타일 캐시·`fixedScale` + 바텀시트 inset + 앱 WebView 지도 코어(`TransitMapView`) 범용화** — 렌더 코어를 건드린 라운드다. (1) **신규 소비처 2곳(웹)** — `/air` 의 [AirStationsMap](../../apps/web/src/components/air/AirStationsMap.tsx)(`c6ac640`, 2026-08-21)과 `/life-map` 의 [LifeMapView](../../apps/web/src/components/life-map/LifeMapView.tsx)(`1d92acb`·`4fd6e22`)가 `MapCanvas` 를 그대로 쓴다. 둘 다 **식당 카테고리 빌더를 안 쓰고 `MapMarker.icon`(src/selectedSrc)** 으로 자기 도메인 SVG 를 넣고, 내 위치(파란 점)·저장 위치(보라 점)는 `overlayMarkers`(fit 제외)로, 키 게이트(로딩/404/오류) 3분기는 버스·지하철 지도와 같은 정책, `poolKey` 는 `'air'`/`'life'`(각각 단일 마운트). 마커 SVG 는 `@repo/utils` 신규 [airMarker.ts](../../packages/utils/src/airMarker.ts)·[lifeMapMarker.ts](../../packages/utils/src/lifeMapMarker.ts)가 그리고, 프레임은 [markerFrame.ts](../../packages/utils/src/markerFrame.ts)의 `buildCircleMarkerSvg`(26×26)/`buildPinMarkerSvg`(32×48) 공용 — 식당·버스·지하철 계열과 규격이 같아 라벨 offset·축소 스케일이 그대로 유효하다. 예외가 (2) **`fixedScale` 마커 + 스타일 캐시(`1d92acb`)** — 일상지도의 12px CCTV 점과 숫자를 새긴 집계 버블은 크기 자체가 의미라 `MapMarker.fixedScale: true` 로 줌<14 축소·라벨 숨김을 건너뛰고, 수천 feature 가 매 프레임 `Style`/`Icon` 을 새로 만들어 메인 스레드가 수 초 멈추던 것을 모듈 `markerStyleCache`(키 = icon src|selectedSrc|categoryKey|variant|selected|compact|label|darkBg, 상한 6,000 초과 시 통째 clear)로 막았다. (3) **바텀시트 inset(`e84e4b9`, 2026-08-22)** — 모바일(=웹 작은 화면) 지도 페이지 4곳(맛집 v2·버스·지하철·일상지도)이 같은 시트 골격([web](web.md)·[transit](transit.md))을 쓰면서 지도 하단 컨트롤이 peek 시트에 가려, [MapLayerControl](../../apps/web/src/components/restaurant/MapLayerControl.tsx)·내 위치·따라가기 pill 이 `bottom-[calc(0.75rem+var(--map-bottom-inset,0px))]` 로 올라가고(변수는 지도 fixed 래퍼가 `SHEET_PEEK_HEIGHT=120px` 로 지정), `MapCanvasHandle.flyTo/flyToZoomIn` 에 `opts.bottomInset` 이 생겨 `centerWithBottomInset` 이 중심을 `inset/2 × resolution` 만큼 남쪽으로 밀어 지점이 보이는 영역 가운데 오게 한다(현재 일상지도만 `sheetHalfInset(headerHeight)` 로 사용). [MyLocationButton](../../apps/web/src/components/restaurant/MyLocationButton.tsx)은 `'timeout'` 상태 문구("위치 측정이 오래 걸렸어요 — 다시 시도")가 추가됐다(`67f14cf`, 상태머신은 [shared](shared.md)). (4) **앱 — WebView 지도 코어가 두 벌이 됐다.** 기존 [publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts)(맛집 전용, `__setMarkers` 함수 채널)와 별개로 대중교통이 만든 [transitMapHtml.ts](../../apps/mobile/src/components/transit/transitMapHtml.ts)+[TransitMapView](../../apps/mobile/src/components/transit/TransitMapView.native.tsx)(cmd 메시지 채널)가 대기 [AirStationsMapCard](../../apps/mobile/src/components/air/AirStationsMapCard.tsx)·일상지도 [app/life-map](../../apps/mobile/app/life-map/index.tsx)의 지도로 재사용됐다(`e348032`). 이를 위해 브리지에 `BridgeMarker.fixedScale` 과 `setMarkers.icons` **아이콘 사전**(마커는 `@cctv:safety` 같은 키만 들고 HTML 이 data URL 로 치환 — 같은 아이콘을 수천 마커가 나눠 쓸 때 페이로드를 마커당 ~60B 로)이 붙었고, [lifeMapBridgeMarkers.ts](../../apps/mobile/src/components/lifeMap/lifeMapBridgeMarkers.ts)는 웹 [lifeMapMarkers.ts](../../apps/web/src/components/life-map/lifeMapMarkers.ts)와 같은 id 규약(`${layer}:${id}` / `cell:${layer}:${index}`)을 브리지 마커로 낸다. 도메인 자체(측정소·CCTV/화장실/병의원 레이어·셀 집계 API)는 [air-quality](air-quality.md)·[life-map](life-map.md). 상세는 [Architecture](#architecture-coverage-high----15-sources)·[Key Decisions](#key-decisions-coverage-high----22-sources).

**2026-07-07 변경 흡수 (대중교통 통합 — OL 지도 인스턴스 풀링 D안 + 겸표시 오버레이 레이어)** — 렌더 코어에 두 가지가 추가된다(둘 다 opt-in prop 이라 식당·어드민 지도는 기존 동작 그대로). (1) **`poolKey` 지도 인스턴스 풀링(D안)** — 버스↔지하철 탭 전환은 라우트 언마운트라 `MapCanvas` 가 매번 재생성돼 타일 재로드 플래시가 남았다. `poolKey` 를 준 `MapCanvas` 는 언마운트 시 OL `Map` 을 파괴하지 않고 모듈 `mapPool`(`Map<string, PooledMap>`)에 보관하고, 다음 마운트가 `get`+`delete`(**take 시맨틱** — StrictMode 이중/동시 마운트가 한 map 을 다투지 않게)로 이어받아 `setTarget` 만 다시 건다 — 타일 캐시·뷰포트가 통째로 살아 플래시가 사라진다. 벡터 레이어 4종(노선 형상·겸표시·정류장·차량 — 대중교통이 도입)은 **마운트마다 새로 생성**하고 `map`/`tileSource` 리스너는 `EventsKey` 로 모아 cleanup 에서 `unByKey` — 살아남는 map 에 이전 마운트 클로저가 중복 발화·누수되는 걸 막는다. 재사용 시 레이어 선택(`layer`/`userPickedLayer`)도 풀에서 승계(테마 기본값으로 `setUrl` 하면 플래시 재발)하고, `apiKey` 불일치(타일 URL 에 키가 박힘)면 폐기 후 신규. 데스크톱·모바일 지도가 CSS 숨김으로 동시 마운트라 키를 `transit-desktop`/`transit-mobile` 로 분리(총 인스턴스 수는 종전과 동일). (2) **`overlayMarkers` 겸표시 레이어** — `markers`(자기 도메인)와 별개 `VectorSource` 로, `fitToMarkers`/fit extent 에서 제외돼 겸표시가 화면을 넓히지 않는다. z순서는 노선 형상→겸표시→정류장→차량(뒤일수록 위)이라 자기 마커가 위에 그려지고 클릭도 먼저 히트된다. 풀 반납 시 이 레이어도 제거 목록에 든다. 두 delta 는 `transitMapViewport`(A안, 탭 전환 뷰포트 이어보기)와 **보완 관계** — 풀이 살아 있으면 뷰포트가 인스턴스째 유지되고, 새로고침·직접 진입으로 풀이 비었을 때만 A안 저장값이 `initialCenter` 로 복원한다. 상세는 [Architecture](#architecture-coverage-high----15-sources)·[Key Decisions](#key-decisions-coverage-high----22-sources). 대중교통 화면 쪽 맥락은 [bus](bus.md)·[transit](transit.md).

**2026-06-25 변경 흡수 (18차, choropleth 지역 통계 지도 + vworld 타일 오탐 probe + 선택 마커 위로)** — 렌더 코어를 일부 건드린다. 핵심 3가지: (1) **지역 통계 choropleth 지도(신규 사용처)** — 어드민 지역 통계 위젯에 신규 [RegionStatsMap.tsx](../../apps/web/src/components/admin/RegionStatsMap.tsx) 가 들어왔다. `MapCanvas`(레스토랑 핀 전용)를 안 거치고 **OpenLayers 를 직접** 쓰는 별도 컴포넌트로, vworld 타일 위에 `색칠(choropleth)/버블/마커` 3모드를 토글한다. 색칠 모드는 시군구 경계 GeoJSON([public/sigungu-geo.json](../../apps/web/public/sigungu-geo.json), 552KB)을 지연 fetch 해 `GeoJSON().readFeatures` 로 폴리곤 레이어를 얹고, 카운트는 **이름 매칭이 아니라** 가게 좌표의 point-in-polygon(`geometry.intersectsCoordinate`)으로 매겨 명칭/구·시 단위 차이를 회피한다. 타일 빌더(`buildVworldTileUrl`)·테마 연동(`useThemeStore.mode → midnight/Base`)은 `MapCanvas` 와 같은 패턴 재사용. (2) **vworld 타일 오류 배너를 키 직접 검사(probe)로 판정** — `tileloaderror` 단발/연속은 키 거부와 동의어가 아니다(빠른 패닝 시 브라우저 리소스 한계로 `net::ERR_INSUFFICIENT_RESOURCES`, 서버는 정상). `MapCanvas` 가 연속 실패 8회 임계를 넘으면 즉시 배너 대신 저줌 단일 타일을 `fetch` 로 직접 probe 해 401/403(거부)일 때만 배너를 띄우고, 200+image 면 억제/해제, throw·기타는 상태 유지. `onTileError` 시그니처가 `()=>void` 에서 `(hasError: boolean)=>void` 로 바뀌어 해제도 전달. (3) **선택 마커를 다른 마커 위로** — OL Style 에 `zIndex`(선택 1000 / 비선택 0)를 줘 클릭 강조 핀이 인접 핀에 안 가린다. **이번 라운드는 16/17차의 호버·레이어·더블클릭 정책에 변경 없음** — 위 셋만 추가.

**2026-06-06 변경 흡수 (17차, 다크/위성 레이어 + 내 위치 공용화 + 더블클릭 확대)** — 이번 라운드는 16차와 달리 렌더 코어를 **건드린다**. 핵심 3가지: (1) **레이어 토글** — 신규 [MapLayerControl.tsx](../../apps/web/src/components/restaurant/MapLayerControl.tsx) 가 웹 `MapCanvas` 좌하단에 일반(`Base`)/다크(`midnight`)/위성(`Satellite`) 3버튼을 깐다. 초기 레이어는 앱 테마(`useThemeStore.mode`)를 따라가고(`light→Base`, `dark→midnight`), 사용자가 한 번 직접 고르면 이후 테마 변경에 끌려가지 않는다(`userPickedLayerRef`). 레이어 변경은 OL Map 재생성 없이 `tileSource.setUrl` 로 URL 만 교체 + 라벨 색 재평가만. (2) **`MyLocationButton` 공용화** — 기존 `PublicRestaurantsMap.tsx` 안에 살던 내부 컴포넌트를 신규 파일 [MyLocationButton.tsx](../../apps/web/src/components/restaurant/MyLocationButton.tsx) 로 추출해 공개 지도 + 어드민 발견 지도(`DiscoverMap`)가 공유. `denied`/`insecure`(평문 HTTP) 구분 UX 동일. (3) **앱 WebView 다크 타일** — `buildPublicRestaurantsMapHtml(apiKey, center, mode)` 가 `mode='dark'` 면 `midnight` 타일 + 어두운 배경 + 반전 라벨로 빌드하고, 런타임 테마 변경은 HTML 재빌드(=WebView 재마운트) 없이 `window.__setMode` 주입으로 처리. 추가로 **더블클릭=확대** — `MapCanvasHandle.flyToZoomIn(lat,lng,minZoom)` 신규 메서드 + 양 wrapper 의 `zoomFocus: { placeId }` prop(참조 바뀔 때마다 `ZOOM_IN_LEVEL=17` 까지 당김, 이미 더 확대면 줌 유지). 단순 호버 패닝은 **제거** — `PublicRestaurantsMap` 는 더 이상 `hoveredPlaceId` 를 받지 않고 `selectedPlaceId`(클릭) 로만 `flyTo`.

**2026-06-01 변경 흡수 (16차, perf/UX 라운드 — 렌더 코어 무변경)** — 이 라운드는 지도 도메인의 렌더링 코어(OpenLayers Map 인스턴스, 마커 빌더, 줌 임계값, declutter 정책)에 **변경 없음**. 두 파일이 터치됐지만 모두 위치 권한 UX 다듬기였다: 앱·웹 "내 위치" 버튼이 `denied`/`unavailable` 에서 비활성 대신 클릭 가능해지고 silent refetch + 설정 안내를 건다(상세는 [Gotchas](#gotchas-coverage-high----20-sources)). 17차에서 웹 측 그 로직이 `MyLocationButton.tsx` 로 추출됐다.

**2026-05-25 변경 흡수 — 카테고리별 라인 아이콘 8종 + variant 통합 + declutter 해제로 줌 아웃 마커 누락 수정**: (1) `MapMarker` 에 `categoryKey?: RestaurantCategoryKey | null` 추가. 한식/일식/중식/카페/디저트/바/양식/분식 8 카테고리를 SVG 라인 아이콘으로 핀 안쪽에 그린다. 자유 텍스트 카테고리는 [packages/utils/src/restaurantCategory.ts](../../packages/utils/src/restaurantCategory.ts) 의 `resolveRestaurantCategoryKey` 가 키워드 우선순위 매칭으로 정규화. 매칭 실패는 generic 식기(포크+나이프) 아이콘. (2) primary/muted variant + selected + 8 + generic 조합을 단일 빌더 `buildRestaurantMarkerSvg` / `buildRestaurantMarkerDataUrl` 로 통합 — 웹·앱이 같은 SVG. (3) 줌 아웃 마커 누락 수정 — 웹 declutter 해제 + 줌 임계값(`LABEL_VISIBLE_ZOOM=14`) 기준 라벨만 토글, 작은 줌에서는 핀도 `SMALL_ICON_SCALE=0.55` 축소.

## Purpose [coverage: high — 10 sources]

vworld 지도 타일을 OpenLayers 위에 직접 그려, 여러 화면에 같은 타일·테마·키 인프라를 공급하는 도메인. `MapCanvas`(레스토랑 핀 전용) 를 거치는 세 화면은 — 첫째 어드민 식당 상세 페이지 우측 사이드바의 단일 마커 위치 카드(작은 사이드 박스 + 우측 슬라이드오버 풀 사이즈), 둘째 공개 `/restaurants` 지도 페이지의 다중 마커 + "이 지역에서 재검색" 위젯, 셋째 어드민 발견(`/admin/discover`) 페이지의 검색 결과·등록 맛집 합성 마커 화면이다. **(2026-06)** 넷째로 어드민 지역 통계 위젯의 [RegionStatsMap](../../apps/web/src/components/admin/RegionStatsMap.tsx) 가 합류했는데, 이건 `MapCanvas` 를 안 거치고 같은 타일/테마 헬퍼만 공유하는 **별도 OpenLayers 컴포넌트**다 — 가변 사이즈 버블·시군구 폴리곤 색칠(choropleth)이 핀 빌더와 안 맞아 직접 구성. **(2026-08)** 다섯째·여섯째로 공개 `/air` 의 [AirStationsMap](../../apps/web/src/components/air/AirStationsMap.tsx)과 `/life-map` 의 [LifeMapView](../../apps/web/src/components/life-map/LifeMapView.tsx)가 `MapCanvas` 소비자로 합류했다 — 둘 다 카테고리 빌더 대신 `MapMarker.icon` 으로 도메인 SVG(`@repo/utils` `airMarker`/`lifeMapMarker`)를 직접 넣고, 일상지도는 크기가 의미인 점·집계 버블을 `fixedScale` 로 그린다. 어드민 키 등록·연결 테스트 UI(`/admin/settings/map`) 까지가 이 도메인의 책임 범위 — friendly 의 `MapProviderConfig` 테이블에서 시작해 web 의 OpenLayers `Map` 인스턴스까지 끊김 없이 한 줄로 이어진다.

키는 운영자가 vworld 콘솔에서 발급받아 어드민 화면에 붙여넣어 등록한다. 어드민 화면은 평문 `apiKey` 를 다시 받아 `probeVworldKey` 로 한 장 타일을 fetch 해 보고 OK/거부를 즉시 보여준다. 같은 키를 공개 페이지가 호출할 수 있도록 `/api/v1/settings/map/public` 만 인증 없이 열어두고, 어드민 보호 라우트와 평문 응답을 그대로 공유한다 (보안 등급 동일 — 키는 어차피 브라우저 Network 탭에 노출되는 클라이언트 사이드 자원).

지도는 베이스맵 레이어를 일반/다크/위성 3종으로 토글할 수 있고(좌하단 `MapLayerControl`), 초기값은 **앱 테마**(라이트→일반, 다크→야간)를 따른다. 앱(WebView) 측도 같은 전략을 쓴다 — vworld 가 제공하는 실제 `midnight` 다크 타일이라 CSS invert 같은 트릭이 없다. 자세한 건 [Key Decisions](#key-decisions-coverage-high----22-sources)·[platform-ui-split](../concepts/platform-ui-split.md).

`MapCanvas` 호출자 요약:

| 호출자 | 라우트 | 마커 | variant | categoryKey | 레이어 컨트롤 | 내 위치 |
|---|---|---|---|---|---|---|
| `VWorldMap` | 어드민 식당 상세 사이드 카드 + 슬라이드오버 | 1개 | primary | 미사용 (단일 핀) | (기본 노출) | 미사용 |
| `PublicRestaurantsMap` | 공개 `/restaurants` | N개 (검색 결과) | primary | `resolveRestaurantCategoryKey(it.category)` | 노출 | 사용(첫 도착 + 재요청) |
| `DiscoverMap` | 어드민 `/admin/discover` | N개 (검색 + 등록 합성) | primary (검색) / muted (등록) | (옵션) | 노출 | 사용(버튼 클릭만) |
| `AirStationsMap` (2026-08) | 공개 `/air` (AirNearbySection) | 측정소 ~650개(좌표 있는 것) | 미사용 — `icon`: 통합지수 등급색 원/핀 10종 | 미사용 | 노출 | 오버레이 점만(버튼은 페이지, `poolKey='air'`) |
| `LifeMapView` (2026-08) | 공개 `/life-map` | CCTV 점/셀 버블 + 화장실·병의원 원/핀 (한 소스) | 미사용 — `icon` + `fixedScale`(점·버블) | 미사용 | 노출 | 사용(우하단 MyLocationButton, `poolKey='life'`) |

## Architecture [coverage: high — 15 sources]

저레벨 캔버스 한 개와 세 개의 화면별 wrapper 로 구성되고, 앱(WebView/iframe) 측에 동형 코어가 한 벌 더 있다. **(2026-06)** 여기에 `MapCanvas` 를 거치지 않고 타일/테마 헬퍼만 공유하는 어드민 통계용 `RegionStatsMap` 한 개가 더 붙는다. **(2026-08)** 공개 지도 wrapper 가 둘 늘었고(`AirStationsMap`·`LifeMapView`), 앱에는 맛집 전용 코어와 별개로 대중교통이 만든 범용 WebView 코어(`TransitMapView`)가 대기·일상지도 화면에 재사용된다 — 앱 지도 코어는 이제 두 벌이다.

1. **`MapCanvas`** ([apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx)) — vworld WMTS 키를 받아 OpenLayers `Map` 인스턴스를 만들고, 마커 배열·선택 상태·viewport 콜백·tile 에러 콜백을 props 로 받는다. 마커 클릭 → `onMarkerSelect`, 사용자 패닝/줌 → `onViewportChangeEnd`, 모든 viewport 변경 → `onViewportSync`. `useImperativeHandle` 로 `flyTo` / `flyToZoomIn` / `fitToMarkers` 를 외부에 노출 — 카드 호버/클릭/더블클릭의 imperative 동작 전용. **(2026-06)** 좌하단 레이어 토글(`MapLayerControl`)을 React 형제로 오버레이하기 위해, OL 타깃 div(`containerRef`)를 `absolute inset-0` 으로 감싸 OL 이 관리하는 DOM 과 분리했다. 레이어 상태(`layer`)는 컴포넌트 state 이고 초기값은 `useThemeStore.mode` 를 따른다. **(2026-06, 18차)** 선택 마커가 인접 핀에 가리지 않도록 style 에 `zIndex`(선택 1000 / 비선택 0)를 준다 — 선택 변경이 style 함수를 재평가하므로 클릭 즉시 반영. 타일 에러 판정은 단순 `tileloaderror` 1회 플래그에서 **연속 실패 임계 + 키 직접 probe** 로 바뀌었다(아래 "타일 에러 — probe 판정" 절). **(2026-07, 대중교통 통합)** 두 opt-in prop 이 붙었다 — `poolKey`(지정 시 언마운트에 OL Map 을 `mapPool` 에 보관·재사용, 탭 전환 타일 플래시 제거)와 `overlayMarkers`(자기 마커와 별도 소스인 fit 제외 겸표시 레이어). 벡터 레이어는 이제 **4종**(노선 형상→겸표시→정류장→차량, `addLayer` 순서=그리는 순서)이고, 풀링 때문에 이들은 마운트마다 새로 생성하고 리스너는 `unByKey` 로 정리한다(아래 "지도 인스턴스 풀링" 절). 미지정(식당·어드민)은 GC·마커 레이어만 — 기존과 완전 동일.
2. **`VWorldMap`** ([apps/web/src/components/restaurant/VWorldMap.tsx](../../apps/web/src/components/restaurant/VWorldMap.tsx)) — 어드민 식당 상세 단일 마커 wrapper. `useMapProviderSecret('vworld')` 로 평문 키를 가져와 `MapCanvas` 에 박는다. 좌표 누락/키 누락/로딩/타일에러 4가지를 `<Placeholder>` 로 분기.
3. **`PublicRestaurantsMap`** ([apps/web/src/components/restaurant/PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx)) — 공개 `/restaurants` 지도 wrapper. `useMapPublicConfig` 로 키 가져옴. 각 마커에 `categoryKey: resolveRestaurantCategoryKey(it.category)` 를 박는다. "이 지역에서 재검색" 버튼, "전체 영역" 토글, "내 위치"(`MyLocationButton`)가 여기 살고, 핸들 ref 로 `flyTo`/`flyToZoomIn` 을 호출한다. **(2026-06)** 더 이상 `hoveredPlaceId` 를 받지 않는다 — 단순 호버 패닝을 없애고 `selectedPlaceId`(카드/마커 클릭)로만 `flyTo`. 더블클릭 "확대"는 신규 `zoomFocus: { placeId } | null` prop 으로 — 참조가 바뀔 때마다 해당 식당으로 `flyToZoomIn(...ZOOM_IN_LEVEL=17)`. `MyLocationButton` 은 이제 [MyLocationButton.tsx](../../apps/web/src/components/restaurant/MyLocationButton.tsx) 로 추출돼 이 파일은 import 만 한다.
4. **`DiscoverMap`** ([apps/web/src/components/admin/discover/DiscoverMap.tsx](../../apps/web/src/components/admin/discover/DiscoverMap.tsx)) — 어드민 발견(`/admin/discover`) wrapper. 검색 결과(빨강) + 등록 맛집(회색)을 한 지도에 합성, 같은 placeId 는 `muted` 우선. **(2026-06)** 공개 지도와 동일한 `zoomFocus`(더블클릭→`flyToZoomIn` ZOOM_IN_LEVEL=17) + `focusCoord`/`locationStatus`/`onRequestLocation`(내 위치) prop 을 받게 됐다. 어드민은 첫 진입 자동 도착이 없고(등록 마커 `fitToMarkers` 우선), "내 위치" 버튼 클릭으로만 `focusCoord` 가 들어와 `MY_LOCATION_ZOOM=16` 동네 수준으로 fly. `MyLocationButton` 은 패널 반대편 모서리에 고정 배치(좌측 모서리면 먼저, 우측이면 "전체 영역" 뒤) — "전체 영역" 토글 시 흔들리지 않게.
5. **`RegionStatsMap`** ([apps/web/src/components/admin/RegionStatsMap.tsx](../../apps/web/src/components/admin/RegionStatsMap.tsx)) — **(2026-06 신규)** 어드민 지역 통계 위젯 전용. `MapCanvas` 를 안 거치고 OL `Map` 을 직접 만든다(가변 버블·폴리곤 색칠이 핀 빌더와 안 맞음). 타일/테마는 같은 헬퍼(`buildVworldTileUrl`, `useThemeStore.mode → layerForTheme`)·키 훅(`useMapPublicConfig`) 재사용. `색칠/버블/마커` 3모드(기본 색칠):
   - **choropleth(색칠)** — 시군구 경계 GeoJSON 을 `${BASE_URL}sigungu-geo.json` 에서 **지연 fetch**(모드 진입 시 1회, `geoCacheRef` 캐시) → `new GeoJSON().readFeatures(..., { featureProjection: 'EPSG:3857' })` 로 폴리곤 feature 화 → `data.points`(좌표 보유 가게)를 각 폴리곤에 `geom.intersectsCoordinate(coord)` point-in-polygon 으로 카운트 → `choroplethStyle(count, maxCount)`(0 거의 투명, 많을수록 진한 파랑 `rgba(37,99,235, 0.25~0.8)` + 숫자 라벨). 카운트 0 폴리곤은 라벨 없음, fit 은 카운트>0 폴리곤 우선. `choroState`(idle/loading/error)로 "경계 불러오는 중"/"불러오지 못했습니다" 오버레이.
   - **bubble(버블)** — 시군구 centroid(`regions.json` 집계의 `lat/lng`)에 `bubbleRadius`(sqrt 스케일 10~34px) 원 + 숫자.
   - **markers(마커)** — 가게별 5px 점.
   타일 레이어 교체는 `MapCanvas` 와 동일하게 맵 재생성 없이 `tileSource.setUrl(buildVworldTileUrl(apiKey, layerForTheme(themeMode)))`. 키 미등록(404)/로딩/에러는 `MapShell` placeholder 분기.
6. **`PublicRestaurantsWebMap`** (앱 — [.native.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.native.tsx) / [.web.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.web.tsx)) — 앱(iOS/Android/Expo Web)의 공개 맛집 지도. WebView/iframe 안에 [publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts) 의 인라인 HTML(OpenLayers + vworld WMTS)을 띄운다. 웹 `PublicRestaurantsMap` 과 동일 입력(`items`, `selectedPlaceId`, `appliedBbox`, `focusCoord`)을 받고 `resolveRestaurantCategoryKey` 로 카테고리를 정규화. **(2026-06)** `useTheme()` 의 `theme.mode` 를 받아, **초기 HTML 빌드에만** 모드를 박는다(`buildPublicRestaurantsMapHtml(apiKey, center, mode)`). 이후 모드 변경은 HTML 재빌드(=WebView 재마운트) 없이 `ready` 직후·테마 변경 effect 에서 `__setMode` 를 주입(native: `injectJavaScript`, web: `postMessage({type:'setMode'})`)해 타일/라벨만 교체 — worklets 충돌·지도 상태 유실 방지. 같은 모드면 `__setMode` 가 no-op(깜빡임 없음). `theme.mode` 는 의도적으로 HTML-빌드 메모의 deps 에서 제외. "내 위치"(📍) 버튼은 16차대로 `pending` 만 disabled, `denied`/`unavailable` 도 클릭 가능(silent refetch → `Alert`/`openSettings`). 마커 데이터에 이미지/썸네일 없음 — `id/lat/lng/name/categoryKey` 만 운반.
7. **`AirStationsMap`** ([apps/web/src/components/air/AirStationsMap.tsx](../../apps/web/src/components/air/AirStationsMap.tsx)) — **(2026-08 신규)** 공개 `/air` 내 주변 섹션([AirNearbySection](../../apps/web/src/components/air/AirNearbySection.tsx))의 전국 측정소 지도. 측정소정보 API 좌표에 '전국' 실시간 캐시의 통합지수 등급(`khaiGrade`)을 측정소명 키로 조인(`gradeByName`)해 마커색으로. 마커 id `air:${stationName}|${lat.toFixed(5)},${lng.toFixed(5)}`, 아이콘은 등급(0=결측, 1~4)×선택 10종을 모듈 레벨 `ICONS` 로 1회 생성(OL 아이콘 캐시가 1회만 디코드). 라벨은 선택 측정소 + 내 주변 결과만(650개 전부는 과밀). 초기 뷰 `KOREA_CENTER {36.3, 127.8, z7}`, 선택/내 위치/저장 위치 변화에 `flyToZoomIn(..., SELECT_ZOOM=11)`(줌아웃 없음). 클릭 → `onSelect(stationName, sidoOption)`(`AIR_SIDO_OPTIONS`·`airSidoMatches` 로 시도 옵션 역산), `my-location`/`saved-location` id 는 무시. `poolKey="air"`(단일 마운트). 도메인은 [air-quality](air-quality.md).
8. **`LifeMapView`** ([apps/web/src/components/life-map/LifeMapView.tsx](../../apps/web/src/components/life-map/LifeMapView.tsx)) — **(2026-08 신규)** `/life-map` 의 지도. 세 레이어(CCTV·화장실·병의원)를 **한 소스**에 순서대로(화장실·병의원을 뒤에 넣어 점 위에) — 마커 변환은 [lifeMapMarkers.ts](../../apps/web/src/components/life-map/lifeMapMarkers.ts) `buildLifeMarkers(layer, result, labeledIds)`: `mode:'cells'` 면 건수 버블(`cell:${layer}:${index}`, `fixedScale`, 건수 키 메모이즈), CCTV 점(`fixedScale`, 목적 그룹 4색 `CCTV_ICONS`, 선택 시 핀), 화장실/병의원 원/핀(+ 주변 목록·선택만 라벨). 클릭은 `parseLifeMarkerId` 로 point/cell 분기 → `onSelectPoint(layer, id)` / `onSelectCell(layer, cell)`(셀은 응답 배열 index 로 역참조 `lifeCellAt`). 상단 중앙 슬롯 = 로딩 칩 > `hint`(확대 안내·절단 안내), 우하단 `MyLocationButton`(`--map-bottom-inset` 반영). `onViewportSync`/`onViewportChangeEnd` 를 페이지로 올려 bbox 조회. `poolKey` 기본 `'life'` — 페이지([LifeMapPage](../../apps/web/src/routes/LifeMapPage.tsx))가 CSS 이중 마운트 대신 `useIsDesktopXl` JS 분기라 지도가 한 장이어서 키 하나로 충돌이 없다(대중교통과 다른 점). 도메인은 [life-map](life-map.md).
9. **앱 범용 WebView 지도 `TransitMapView`** ([.native.tsx](../../apps/mobile/src/components/transit/TransitMapView.native.tsx) / [.web.tsx](../../apps/mobile/src/components/transit/TransitMapView.web.tsx), [transitMapHtml.ts](../../apps/mobile/src/components/transit/transitMapHtml.ts), [transitMapBridge.ts](../../apps/mobile/src/components/transit/transitMapBridge.ts), [useTransitMapSync.ts](../../apps/mobile/src/components/transit/useTransitMapSync.ts)) — 대중교통이 만든 OpenLayers WebView 코어. `publicRestaurantsMapHtml.ts` 와 달리 RN→Web 이 **명령 메시지(`TransitMapCmd`: setMode/setActive/setMarkers/setSelected/setOverlayMarkers/…)** 로 통신하고 `useTransitMapSync` 가 prop 변화를 effect 로 명령화한다. **(2026-08-22)** 대기 [AirStationsMapCard](../../apps/mobile/src/components/air/AirStationsMapCard.tsx)(고정 높이 260, 아이콘 사전 키 `@air:{grade}:{s|b}`, 선택 측정소 `flyToZoomIn` 은 지도 ready 후 명령이 큐잉되지 않아 600ms 지연 발사)와 일상지도 [app/life-map/index.tsx](../../apps/mobile/app/life-map/index.tsx)(`buildLifeBridgeMarkers` → `{ markers, icons }` 를 `markers`+`markerIcons` prop 으로)가 재사용. `BridgeMarker.fixedScale` 은 웹과 같은 의미(`compact = !selected && !m.fixedScale && zoom < LABEL_VISIBLE_ZOOM`), `setMarkers.icons` 는 `fillMarkerSource` 가 `m.icon`/`m.iconSel` 이 사전 키면 값으로 치환. 맛집 지도는 여전히 `PublicRestaurantsWebMap` 별도 코어.

### 도메인 마커 빌더 계열 — markerFrame 공용 프레임 (2026-08 정리)

도메인마다 `@repo/utils` 에 빌더 한 파일이 있고, 전부 [markerFrame.ts](../../packages/utils/src/markerFrame.ts)의 `buildCircleMarkerSvg({ fill, innerSvg })`(26×26, 중심 앵커) / `buildPinMarkerSvg({ fill, innerSvg })`(32×48, 꼭지점 앵커) 두 프레임에 흰 24×24 라인 아이콘 조각을 끼운다. 규격이 같아야 `MapCanvas` 의 라벨 offset(`-54`/`20`)·`SMALL_ICON_SCALE` 축소가 맞는다. 예외 두 가지가 `fixedScale` 이다.

| 빌더 | 비선택 | 선택 | 색 | fixedScale |
|---|---|---|---|---|
| `buildRestaurantMarkerSvg(key, selected, variant)` ([restaurantCategory.ts](../../packages/utils/src/restaurantCategory.ts)) | 원 + 카테고리 아이콘 | 핀 | primary 빨강 / muted 회색 | ✗ |
| `buildBusStopMarkerDataUrl(selected)` ([busMarker.ts](../../packages/utils/src/busMarker.ts)) | 원 | 핀 | 파랑 | ✗ |
| `buildSubwayStationMarkerDataUrl({ selected, transfer })` ([subwayMarker.ts](../../packages/utils/src/subwayMarker.ts)) | 원(환승 이중 링) | 핀 | 청록 | ✗ |
| `buildAirStationMarkerDataUrl({ grade, selected })` ([airMarker.ts](../../packages/utils/src/airMarker.ts)) | 원 + 바람 아이콘 | 핀 | `AIR_MARKER_COLORS` 등급 5색 — 0 결측 `#9ca3af` / 1 `#0ea5e9` / 2 `#10b981` / 3 `#f59e0b` / 4 `#f43f5e`(선택은 한 단계 진하게) | ✗ |
| `buildAirSavedLocationMarkerDataUrl()` | 26×26 보라 점(`#7c3aed`) + 흰 링 + 후광 | (동일) | — | ✗(overlay) |
| `buildLifeCctvDotDataUrl(group)` / `buildLifeCctvPinDataUrl(group)` ([lifeMapMarker.ts](../../packages/utils/src/lifeMapMarker.ts)) | **12×12 점**(흰 외곽선 1.5) | 핀 | `LIFE_CCTV_GROUP_COLOR` 4색 — safety `#2a78d6` / child `#eb6834` / traffic `#1baf7a` / etc `#4a3aa7` | ✓ |
| `buildLifeToiletMarkerDataUrl(selected)` | 원 + 변기 아이콘 | 핀 | `#c2185b` | ✗ |
| `buildLifeHospitalMarkerDataUrl(selected)` | 원 + 십자 | 핀 | `#00897b`(종별 무관 단색 — 그룹색을 더 얹으면 한 화면 색이 8개를 넘어 분리가 깨짐) | ✗ |
| `buildLifeCellMarkerDataUrl(layer, count)` | 건수 버킷 4단 원(26/34/40/46px, 폰트 10~13, 채움 0.85) + **숫자를 SVG 에 내장** | (동일 — `selectedSrc = src`) | `LIFE_LAYER_COLOR` | ✓ |

집계 버블이 숫자를 이미지에 새기는 이유: `MapCanvas` 라벨은 줌 14 미만에서 꺼지는데 셀 모드는 바로 그 저줌에서만 쓰인다. 일상지도 5색(CCTV 4 + 화장실)은 dataviz 범주 팔레트로 CVD·정상시 전 쌍 분리를 검증한 조합(lifeMapMarker.ts 주석, 2026-08-21). 호출자는 아이콘 data URL 을 **모듈 레벨 상수**로 1회 생성해 공유한다(OL 이 같은 `src` 이미지를 1회만 디코드).

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

실제 SVG 는 (`icon` 을 직접 지정한 도메인 마커를 빼면) 모두 [packages/utils/src/restaurantCategory.ts](../../packages/utils/src/restaurantCategory.ts) 의 `buildRestaurantMarkerSvg(key, selected, variant)` 가 그린다 — 비선택은 26×26 원(중심 앵커) + 안쪽 카테고리 아이콘, 선택은 32×48 핀(꼭지점 앵커) + 같은 안쪽 아이콘. variant 는 외곽 채움 색만 결정한다.

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

### 지도 인스턴스 풀링 — 탭 전환 플래시 제거 (D안, 2026-07)

**(대중교통 통합)** 버스↔지하철 탭 전환은 라우트 언마운트라 `MapCanvas` 가 매번 새로 생성돼, 뷰포트 이어보기(A안)로도 **타일 재로드 플래시**가 남았다. `poolKey` prop 을 준 `MapCanvas` 는 OL `Map` 인스턴스를 파괴하지 않고 모듈 `mapPool`(`Map<string, PooledMap>`)에 보관했다가 다음 마운트가 이어받는다.

- **`PooledMap`** = `{ map, tileSource, apiKey, layer, userPickedLayer }`. `tileSource` 는 URL 에 `apiKey` 가 박혀 있어 재사용 판정에 쓰고, `layer`/`userPickedLayer` 는 재사용 첫 렌더가 테마 기본값으로 `setUrl`(→타일 전체 리프레시=플래시) 하지 않도록 레이어 선택을 승계하기 위함.
- **take 시맨틱** — 획득은 `mapPool.get(poolKey)` + 즉시 `delete`. StrictMode 이중 마운트·동시 마운트가 한 map 을 공유하는 사고를 원천 차단한다. `apiKey` 불일치면 꺼낸 map 을 `dispose` 하고 신규 경로로 폴백(키 갱신 대응).
- **레이어 4종은 마운트마다 재생성** — 노선 형상·겸표시·정류장·차량 `VectorSource`/`VectorLayer` 는 재사용이든 신규든 새로 만들어 이전 마운트의 feature·보간 상태를 잇지 않는다. baseLayer(index 0, 타일)만 남겨 타일 캐시를 이어받는다. 재사용 마운트는 `setTarget(container)` + `updateSize()` 로 새 DOM 에 붙이되 `View` 는 안 건드려(뷰포트 유지) 캐시 타일이 즉시 그려진다.
- **리스너 정리(`unByKey`)** — `map`/`tileSource` 에 건 리스너 키(`pointerdrag`/`wheel`/`moveend`/`click`/`postrender`)를 `EventsKey[]` 로 모아 cleanup 에서 전부 해제. 풀링으로 map 이 살아남으므로 안 하면 이전 마운트 클로저가 중복 발화·누수된다(미풀링이어도 무해).
- **반납(release)** — 언마운트 cleanup 이 레이어 4종 제거 + `setTarget(undefined)` 후, `poolKey` 있으면 `mapPool.set(poolKey, {...})`. 방어적으로 이미 같은 키 엔트리가 있으면 지금 map 을 `dispose` 하고 기존 풀을 보존(한 키를 둘이 다투는 상황 회피).
- **이중 마운트 대응 키 분리** — Bus/SubwayPage 는 데스크톱·모바일 지도를 CSS 숨김(`hidden xl:flex`/`xl:hidden`)으로 **동시 마운트**한다. 단일 키면 한쪽만 재사용돼 나머지가 플래시하므로 `transit-desktop`/`transit-mobile` 로 나눈다(페이지당 풀 엔트리 2개, 총 인스턴스 수는 종전과 동일).

풀링은 [transitMapViewport](../../apps/web/src/components/transit/transitMapViewport.ts)(A안)와 보완재다 — 풀이 살아 있으면 뷰포트가 인스턴스째 유지되고, 새로고침·직접 진입으로 풀이 빈 상태에서만 A안 저장값이 `initialCenter` 로 복원한다.

### 겸표시(overlay) 마커 레이어 — fit 제외 보조 마커 (2026-07)

**(대중교통 통합)** `overlayMarkers` prop 은 주변 모드에서 상대 도메인(버스 탭→지하철역, 지하철 탭→정류장)을 함께 그리는 보조 마커다. `markers`(자기 도메인)와 **별도 `VectorSource`** 라 `fitToMarkers`/fit extent 를 넓히지 않는다 — 겸표시 때문에 지도가 줌아웃되지 않는다. z순서는 노선 형상→**겸표시**→정류장→차량이라 자기 마커가 위에 그려지고 클릭도 먼저 히트된다. 클릭은 `markerId` 로 잡혀 `onMarkerSelect` 로 전달되고(호출자가 `x-` 등 id prefix 로 자기/상대 도메인 구분), 라벨은 호출자가 안 넘겨 생략, 선택 개념이 없어 항상 비선택 스타일. `overlayMarkers` 가 바뀔 때만 전용 소스를 `clear` 후 다시 칠해(주변 모드 이탈/토글 off 시 잔상 제거) 마커 파이프라인과 독립적으로 갱신된다. 미지정/빈 배열이면 빈 레이어 — 식당·어드민 지도는 기존과 완전 동일.

### 앱 (WebView/iframe) 동형 코어 — 맛집 전용

**(2026-08 주의)** 아래는 맛집 지도 코어다. 대중교통·대기·일상지도 앱 화면은 별개의 범용 코어 `TransitMapView`(위 9번)를 쓴다 — 타일/테마/declutter 정책을 바꾸면 두 HTML 을 같이 손봐야 한다. [publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts) 은 빌드 시점에 18개(8 카테고리 + generic, 각 선택/비선택) data URL 을 미리 만들어 HTML 의 `ICONS` 객체에 inject. 런타임은 `ICONS[catKey] || ICONS['_']` 한 줄 lookup. RN ↔ Web 채널은 `__setMarkers` / `__setSelected` / `__setMode` / `__flyTo` 함수로 분리 — selection 변경이 vectorSource clear + N개 feature 재생성을 일으키지 않도록 selection 채널을 떼어내 `prev/next` 두 setStyle 만 수행한다.

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

## Talks To [coverage: high — 13 sources]

- **friendly DB (`MapProviderConfig`)** -- 평문 키 1행 저장. AI 와 달리 env fallback 없음 ([map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts) line 11-13).
- **vworld API CDN (`https://api.vworld.kr/req/wmts/1.0.0/`)** -- 직접 타일만 호출. JS SDK (`vw.ol3.Map`) 는 안 쓴다 — SDK 는 init URL 도메인 화이트리스트 검증이 fragile. WMTS 직접 호출은 키만 검증 ([packages/utils/src/vworld.ts](../../packages/utils/src/vworld.ts)). LAYER 는 `Base`/`gray`/`midnight`/`Satellite`/`Hybrid` 중 현재 `Base`/`midnight`/`Satellite` 3종을 컨트롤로 노출.
- **`@repo/utils` (`vworld.ts`)** -- `VworldLayer` 타입, `buildVworldTileUrl(apiKey, layer)`, `probeVworldKey`. **(주의)** 타일 URL 빌더는 옛 `apps/web/src/lib/vworld.ts` 가 아니라 2026-05-14 `3e3e545` 부터 `packages/utils/src/vworld.ts` 에 있다(웹·앱 공용). 웹 측 `apps/web/src/lib/vworld.*` 는 더 이상 없다(2026-08-30 확인 — 레거시 `.js` 도 삭제됨; schema Topics 표의 `apps/web/src/lib/vworld.ts` 표기는 낡음).
- **`@repo/utils` (`restaurantCategory.ts`)** -- `resolveRestaurantCategoryKey`, `buildRestaurantMarkerSvg`, `buildRestaurantMarkerDataUrl`, `RESTAURANT_CATEGORY_KEYS`. 자유 텍스트 카테고리 → 8키 정규화 + 마커 SVG 빌더를 한 자리에.
- **`@repo/utils` (`markerFrame.ts` · `airMarker.ts` · `lifeMapMarker.ts`)** -- **(2026-08)** 도메인 마커 빌더 계열. 프레임 두 함수(`buildCircleMarkerSvg`/`buildPinMarkerSvg`)를 식당·버스·지하철·대기·일상지도가 공유하고, 각 도메인 파일이 색·아이콘·`fixedScale` 규격을 정한다. 웹 `MapCanvas` 와 앱 `TransitMapView` 브리지가 같은 data URL 을 쓴다([platform-ui-split](../concepts/platform-ui-split.md)).
- **웹 시트 골격 (`sheet/useMapSheets.ts`)** -- **(2026-08-22)** `SHEET_PEEK_HEIGHT`(120) 가 지도 fixed 래퍼의 `--map-bottom-inset` 값이 되고, `sheetHalfInset(headerHeight)` 가 `flyTo` 의 `bottomInset` 인자가 된다. 지도 컴포넌트는 시트의 존재를 모른다 — 변수와 인자만 받는다([web](web.md)·[transit](transit.md)).
- **air-quality / life-map 도메인** -- **(2026-08)** [AirStationsMap](../../apps/web/src/components/air/AirStationsMap.tsx)·[LifeMapView](../../apps/web/src/components/life-map/LifeMapView.tsx)(웹)와 [AirStationsMapCard](../../apps/mobile/src/components/air/AirStationsMapCard.tsx)·[app/life-map](../../apps/mobile/app/life-map/index.tsx)(앱)이 소비자. 측정소 조인·셀 집계·레이어 API 는 [air-quality](air-quality.md)·[life-map](life-map.md) — 여기서는 마커·카메라·키 게이트만.
- **`apps/web` theme store (`useThemeStore`)** -- **(2026-06 신규)** `MapCanvas` 가 `useThemeStore((s) => s.mode)` 로 초기 레이어를 결정하고 테마 변경을 구독([apps/web/src/stores/theme.ts](../../apps/web/src/stores/theme.ts)). 앱 측은 `@repo/shared` 의 `useTheme()` 로 동등한 `theme.mode` 를 받는다.
- **shared (`settingsMapApi`, `useSettingsMap`)** -- `list/update/remove/getSecret/publicConfig` API + 동명 React Query hooks ([useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts)).
- **shared (`useUserLocation` / `useUserLocationNative`)** -- `MyLocationButton`(웹)·앱 "내 위치" 버튼이 `UserLocationStatus`(`pending`/`granted`/`denied`/`unavailable`) 를 받아 분기. 상세는 [shared](shared.md).
- **admin UI** -- `AdminSettingsPage` 탭 컨테이너, `AdminMapKeysPage` provider 카드 + 폼 + 연결 테스트, `AdminLayout` sidebar "설정" 진입점.
- **admin restaurant detail** -- `AdminRestaurantDetailPage` 우측 280px 사이드 카드 + Maximize2 → Radix Dialog 우측 슬라이드오버(740px)에 별도 `VWorldMap`. 한 OL Map 을 setTarget 으로 옮기는 트릭은 안 쓴다 ([AdminRestaurantDetailPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx)).
- **public restaurants page / admin discover page** -- `RestaurantsPage`(`/restaurants`) → `PublicRestaurantsMap`, `AdminDiscoverPage`(`/admin/discover`) → `DiscoverMap` 가 검색(`primary`) + 등록(`muted`) 합성, 같은 placeId 는 muted 우선.
- **admin 지역 통계 위젯 / `RegionStatsResult`** -- **(2026-06 신규)** `RegionStatsMap` 이 `RegionStatsResultType`([api-contract](../../packages/api-contract/src/schemas))의 `sidos[].sigungus[]`(centroid+count, 버블/색칠 라벨)와 `points[]`(좌표 보유 가게, 마커 + choropleth point-in-polygon)를 입력으로 받는다. 통계 산출(`computeRegionStats`)·운영·텔레그램 발송은 [friendly](friendly.md)·[telegram](telegram.md) 토픽 — 여기서는 그 결과를 지도 위에 렌더하는 책임만. 경계 에셋 [public/sigungu-geo.json](../../apps/web/public/sigungu-geo.json)(2018 KOSTAT 시군구, mapshaper 4% 단순화, 552KB/gz 120KB)은 색칠 모드 진입 시에만 지연 fetch.

## API Surface [coverage: high — 9 sources]

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
  icon?: { src: string; selectedSrc: string };           // 도메인 아이콘 직접 지정(variant/categoryKey 빌더 대신).
                                                         // markerFrame 규격(26×26 원 / 32×48 핀)이어야 라벨 offset·축소가 맞음.
  fixedScale?: boolean;                                  // (2026-08) 줌<14 축소·라벨 숨김 건너뜀 — 12px 점·숫자 버블용. 선택 시 핀 전환은 동일.
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
  overlayMarkers?: MapMarker[];                          // (2026-07) fit 제외 겸표시 레이어(노선→겸표시→마커→차량 z순서). 미지정=빈 레이어.
  poolKey?: string;                                      // (2026-07) 지정 시 OL Map 인스턴스를 mapPool 에 보관·재사용(탭 전환 플래시 제거). 마운트 수명 동안 불변.
  className?: string;
  // 대중교통(버스/지하철)이 도입한 routeLine·vehicles·followVehicleId·onVehicleSelect·
  // onFollowInterrupted·fitToCoords 확장은 [bus](bus.md)·[subway](subway.md) 에 상술.
}
interface MapCanvasHandle {
  // (2026-08-22) opts.bottomInset: 아래를 덮는 높이(px, 모바일 바텀시트) — centerWithBottomInset 이
  // 중심을 inset/2 × resolution 만큼 남쪽으로 밀어 지점이 "보이는 영역" 세로 가운데에 오게 한다.
  flyTo(lat: number, lng: number, zoom?: number, opts?: { bottomInset?: number }): void;
  // flyTo 와 같지만 최소 minZoom 까지 확대(이미 더 확대면 줌 유지, 줌아웃 안 함).
  // 카드 더블클릭 "확대" 에 사용.
  flyToZoomIn(lat: number, lng: number, minZoom: number, opts?: { bottomInset?: number }): void;
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

**도메인 마커 빌더 (2026-08 — [markerFrame.ts](../../packages/utils/src/markerFrame.ts) · [airMarker.ts](../../packages/utils/src/airMarker.ts) · [lifeMapMarker.ts](../../packages/utils/src/lifeMapMarker.ts)):**

```ts
buildPinMarkerSvg({ fill, innerSvg }) / buildCircleMarkerSvg({ fill, innerSvg })   // 32×48 핀 / 26×26 원 공용 프레임
buildAirStationMarkerSvg / buildAirStationMarkerDataUrl({ grade: AirGradeLevel|null, selected })  // 등급색 바람 아이콘
buildAirSavedLocationMarkerSvg / DataUrl()                                          // 보라 점(저장한 내 대기 위치)
AIR_MARKER_COLORS: Record<AirGradeLevel | 0, { base; selected }>
buildLifeCctvDotSvg / DataUrl(group) · buildLifeCctvPinDataUrl(group)              // 12px 점 / 선택 핀
buildLifeToiletMarkerDataUrl(selected) · buildLifeHospitalMarkerDataUrl(selected)  // 원/핀
buildLifeCellMarkerSvg / DataUrl(layer, count)                                     // 집계 버블(숫자 내장)
LIFE_CCTV_GROUP_COLOR · LIFE_TOILET_COLOR · LIFE_HOSPITAL_COLOR · LIFE_LAYER_COLOR
```

**웹 시트 inset 상수 ([sheet/useMapSheets.ts](../../apps/web/src/components/sheet/useMapSheets.ts)):** `SHEET_PEEK_HEIGHT = 120`(→ `--map-bottom-inset`), `SHEET_HALF_RATIO = 0.55`, `sheetHalfInset(headerHeight) = round((innerHeight - headerHeight) × 0.55)`(→ `flyTo` `bottomInset`).

**앱 브리지 확장 ([transitMapBridge.ts](../../apps/mobile/src/components/transit/transitMapBridge.ts), 2026-08-22):** `BridgeMarker.fixedScale?: boolean`, `{ type: 'setMarkers'; markers; icons?: Record<string, string> }`(아이콘 사전 — `icon`/`iconSel` 이 키면 HTML 이 값으로 치환), `TransitMapViewProps.markerIcons?: Record<string, string> | null`.

**vworld 타일 빌더 ([packages/utils/src/vworld.ts](../../packages/utils/src/vworld.ts)):**

```ts
export type VworldLayer = 'Base' | 'gray' | 'midnight' | 'Satellite' | 'Hybrid';
export const buildVworldTileUrl = (apiKey: string, layer: VworldLayer = 'Base'): string =>
  `https://api.vworld.kr/req/wmts/1.0.0/${apiKey}/${layer}/{z}/{y}/{x}.png`;
export const probeVworldKey = async (apiKey: string): Promise<boolean>;  // Base/7/44/109.png 한 장 fetch
```

`probeVworldKey` 는 `WMTS/{KEY}/Base/7/44/109.png` 한 장 fetch, `200` + `content-type: image/*` 면 OK. 어드민 "연결 테스트" 가 호출.

## Data [coverage: medium — 3 sources]

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

레이어 선택은 DB 에 저장되지 않는다 — 클라이언트 state(테마 연동 초기값 + 세션 내 사용자 오버라이드)일 뿐. 새로고침하면 다시 테마를 따른다. **(2026-08)** 마커 스타일 캐시(`markerStyleCache`, 상한 6,000)·도메인 아이콘 data URL 상수·`mapPool` 도 전부 클라이언트 모듈 메모리(비영속)다.

## Key Decisions [coverage: high — 22 sources]

- **2026-08-22: 바텀시트 회피는 CSS 변수(`--map-bottom-inset`) + 핸들 옵션(`bottomInset`)으로 — `MapCanvas` prop 을 늘리지 않는다** -- 모바일 시트가 지도 아래를 덮어 좌하단 레이어 토글·따라가기 pill·내 위치 버튼이 가려졌다. 컨트롤 위치는 지도 fixed 래퍼가 변수 한 줄(`--map-bottom-inset: 120px`)로 지정하고 컨트롤은 `bottom-[calc(0.75rem+var(--map-bottom-inset,0px))]` 로 읽는다(데스크톱 래퍼는 변수 없음 → 0 → 종전 위치). 카메라 보정은 호출자만 아는 시트 높이를 `flyTo(..., { bottomInset })` 인자로 넘긴다(`centerWithBottomInset`). 지도 컴포넌트는 시트의 존재를 모른다 — 시트 골격을 안 쓰는 식당·어드민 지도는 무변경.
- **2026-08-22: 앱 신규 지도 화면은 맛집 코어를 확장하지 않고 `TransitMapView` 를 범용화 + 아이콘 사전** -- 대기·일상지도 앱 화면이 지도를 필요로 할 때 `publicRestaurantsMapHtml`(함수 채널, 맛집 아이콘 18종 인라인)을 늘리는 대신 명령 채널 코어를 재사용했다. 일상지도는 CCTV 점 수천 개가 같은 data URL 을 반복하면 브리지 페이로드가 폭발하므로 `setMarkers.icons` 사전으로 마커당 ~60B(키만)로 줄였고, `fixedScale` 도 웹과 같은 의미로 이식했다. 결과로 앱 지도 코어는 맛집 전용 + 범용 두 벌.
- **2026-08-21: 대량 마커는 클라 클러스터링 대신 서버 셀 집계 + `fixedScale` 버블 + 스타일 캐시** -- `MapCanvas` 는 여전히 클러스터링을 안 한다. 일상지도는 저줌에서 서버가 셀 집계(`mode:'cells'`)를 내려주고 지도는 건수 버블을 그리며(집계 로직은 [life-map](life-map.md)), 확대하면 점으로 바뀐다. 점(12px)·버블은 크기가 의미라 `fixedScale` 로 줌 축소·라벨 규칙에서 뺐고, 수천 feature × 매 프레임 style function 호출이 `Style`/`Icon` 을 계속 새로 만들어 메인 스레드가 수 초 멈추던 것은 입력 키 기반 `markerStyleCache`(OL 권장 — `Style` 은 feature 간 공유 안전)로 막았다. 라벨 문자열까지 키에 넣어 항목 수만큼만 불어나고 6,000 을 넘으면 통째 비운다.
- **2026-08-21: 도메인 마커는 `MapMarker.icon` 주입 — 스타일 함수 분기 대신 utils 빌더** -- 새 도메인(대기·일상지도)마다 `MapCanvas` 의 style function 에 분기를 넣지 않고, `@repo/utils` 빌더가 `markerFrame` 규격(26×26 원 / 32×48 핀)으로 data URL 을 만들어 `icon: { src, selectedSrc }` 로 넣는다(버스·지하철이 먼저 연 길). 규격을 지키면 라벨 offset·축소 스케일·선택 핀 전환이 공짜로 맞고, 앱 브리지도 같은 URL 을 그대로 쓴다. 색은 도메인 파일이 소유(대기 등급 5색은 웹 `airGrade.ts` hex 와 동일 값 — 지도는 CSS 변수를 못 써 상수).
- **2026-07(대중교통 통합): 탭 전환 플래시 — 페이지 keep-alive(C안) 대신 지도 인스턴스 풀링(D안)** -- 탭 전환=라우트 언마운트라 지도가 재생성돼 뷰포트 이어보기(A안)로도 타일 재로드 플래시가 남았다. 후보는 세 가지였다 — A안(뷰포트만 저장/복원, 플래시 잔존), C안(숨긴 페이지를 keep-alive), D안(OL Map 인스턴스를 풀에 보관). C안은 숨은 페이지가 상대 탭 URL 파라미터에 반응하는 구조 충돌로 기각하고, `poolKey` opt-in D안을 택했다. **opt-in 이 핵심** — 미지정(식당·어드민 지도)은 풀에 손대지 않고 기존처럼 GC 하므로 공용 컴포넌트 회귀가 원천 차단된다. 획득은 take(get+delete) 시맨틱, `apiKey` 불일치는 폐기 후 신규, 레이어 선택 승계로 재사용 첫 렌더 `setUrl` 플래시 회피. A안은 새로고침·직접 진입(풀 빈 상태) 복원용 보완재로 유지(둘 다 유지). 상세는 [Architecture](#architecture-coverage-high----15-sources)의 "지도 인스턴스 풀링" 절.
- **2026-07(대중교통 통합): 겸표시는 별도 소스 — fit extent 오염 회피** -- 상대 도메인 겸표시(`overlayMarkers`)를 자기 마커(`markers`)와 같은 소스에 넣으면 `fitToMarkers` 가 겸표시까지 끌어안아 화면이 넓어진다. 노선 형상 레이어를 마커 fit 에서 뺀 것과 같은 이유로 별도 `VectorSource` 에 그려 fit 에서 제외한다. z순서(노선→겸표시→마커→차량)로 자기 마커가 위에 오고 클릭도 먼저 히트, 클릭 자체는 `markerId`→`onMarkerSelect` 로 자기 마커와 같은 채널을 타되 호출자가 id prefix(`x-`)로 상대 도메인을 가려낸다(별도 클릭 채널을 안 만든다).
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

## Gotchas [coverage: high — 20 sources]

- **(2026-08) 스타일 캐시 키에 라벨 문자열이 들어간다.** 라벨 붙은 마커 수만큼 엔트리가 늘고 6,000 을 넘으면 통째로 비워 잠깐 전부 재생성한다. 라벨을 매 프레임 바꾸는 식(카운트다운을 라벨로 등)으로 쓰면 캐시가 무력해지고 예전 멈춤이 돌아온다 — 동적 텍스트는 라벨이 아니라 별도 채널로.
- **(2026-08) `fixedScale` 은 축소·라벨만 건너뛴다 — 선택 시 핀 전환은 그대로.** CCTV 12px 점은 선택하면 `selectedSrc`(32×48 핀)로 바뀐다. 셀 버블은 `selectedSrc = src` 라 변화 없음. 점을 "항상 점" 으로 두고 싶으면 `selectedSrc` 에 같은 URL 을 넣는다.
- **(2026-08) `poolKey` `'air'`/`'life'` 는 단일 마운트 전제.** 대중교통과 달리 이 페이지들은 지도를 한 장만 마운트한다(`AirNearbySection` 1회, `LifeMapPage` 는 `useIsDesktopXl` JS 분기). CSS 이중 마운트를 도입하면 대중교통처럼 키를 레이아웃별로 나눠야 한다(take 시맨틱).
- **(2026-08-22) `--map-bottom-inset` 은 지도 fixed 래퍼에 둬야 컨트롤이 반응한다.** 컨트롤은 `var(--map-bottom-inset,0px)` 만 읽는다 — 조상에 없으면 0(데스크톱과 동일). 시트 peek 높이를 바꾸면 `SHEET_PEEK_HEIGHT` 와 래퍼 변수가 같이 움직인다(둘 다 `useMapSheets` 상수에서 오지만 래퍼는 inline style 로 직접 지정).
- **(2026-08-22) `bottomInset` 은 flyTo 호출자의 몫 — MapCanvas 는 시트를 모른다.** 목록에서 항목을 골라 날아갈 때 상세 시트(half = 가용 높이 55%)에 지점이 가리면 `sheetHalfInset(headerHeight)` 를 넘겨야 한다. 지금은 일상지도만 넘기고 맛집 v2·버스·지하철 래퍼는 미적용(지점이 시트 밑으로 갈 수 있음).
- **(2026-08) 앱 `TransitMapView` 는 ready 뒤 명령을 큐잉하지 않는다.** `AirStationsMapCard` 가 첫 `flyToZoomIn` 을 600ms 지연시키는 이유 — 마운트 직후 바로 쏘면 WebView 가 아직 핸들러를 안 붙였을 수 있다. 새 소비자도 초기 카메라 명령은 `ready` 이후로 미룰 것.
- **(2026-08) 앱 지도 코어가 두 벌.** 맛집(`publicRestaurantsMapHtml`)과 범용(`transitMapHtml`) HTML 이 별개라 타일 URL·다크 모드·declutter·라벨 정책을 바꾸면 양쪽을 손봐야 한다(`RegionStatsMap` 이 `MapCanvas` 와 분리된 것과 같은 결의 분산). 신규 앱 화면은 범용 코어를 쓴다.
- **(2026-07) 같은 `poolKey` 를 두 `MapCanvas` 가 동시에 쓰면 안 된다.** take(get+delete) 시맨틱이라 첫 마운트가 풀을 비우면 둘째는 재사용 실패로 플래시한다. Bus/SubwayPage 는 데스크톱·모바일 지도를 CSS 숨김으로 동시 마운트하므로 키를 `transit-desktop`/`transit-mobile` 로 나눴다 — 새 대중교통 지도를 붙일 때 레이아웃마다 고유 키를 줄 것. 반납 시 이미 같은 키 엔트리가 있으면 지금 map 을 `dispose` 하는 방어가 있지만, 정상 흐름은 한 시점에 한 레이아웃만 실제 표시되는 것을 전제한다.
- **(2026-07) 풀링 map 은 레이어/리스너를 마운트마다 재생성해야 한다.** 살아남는 map 에 이전 마운트의 벡터 레이어·리스너 클로저가 남으면 중복 발화·누수·잔상이 된다. cleanup 이 레이어 4종 제거 + `unByKey`(모은 `EventsKey`) 를 반드시 수행하고, 재사용 마운트는 새 소스로 다시 `addLayer` 한다. 또 재사용 첫 렌더가 테마 기본값으로 `setUrl` 하면 타일 전체 리프레시=플래시가 재발하므로 풀의 `layer`/`userPickedLayer` 를 승계해야 한다 — 풀 로직을 손볼 때 이 세 가지(레이어 재생성·리스너 해제·레이어 승계)를 함께 유지.
- **(2026-07) `overlayMarkers` 는 fit 에서 빠진다 — 겸표시가 안 보이면 자기 마커 fit 을 의심하지 말 것.** 별도 소스라 `fitToMarkers` extent 에 안 들어간다(의도). 겸표시가 화면 밖이면 지도가 자동으로 그쪽으로 맞추지 않는다 — 자기 정류장/역 기준으로 fit 된 화면 안에 들어오는 겸표시만 보인다.
- **레이어 변경 첫 렌더 skip — `layerInitRef` 가드** -- map-create effect 가 이미 `layerRef.current` 로 올바른 타일을 만들었으므로, layer effect 의 첫 실행은 `setUrl` 을 건너뛴다. 같은 URL 로 `setUrl` 하면 OL 이 타일을 통째 리프레시해 깜빡인다. layer effect 를 손볼 때 이 가드를 깨면 첫 렌더 깜빡임 회귀.
- **테마-레이어 추종은 사용자가 직접 고르기 전까지만** -- `userPickedLayerRef` 가 true 가 되면 테마 변경 effect 가 `return` 으로 빠진다. 다크모드 토글 시 지도가 안 따라온다면 그 세션에서 이미 컨트롤을 눌렀기 때문 — 의도된 동작. 새로고침하면 다시 테마를 따른다(레이어는 비영속).
- **앱 WebView `__setMode` no-op 가드** -- `ready` 직후 첫 `__setMode` 호출은 초기 HTML 이 이미 그 모드로 빌드돼 있어 `nextDark === darkBg` 라 no-op(깜빡임 없음). `theme.mode` 를 HTML-빌드 메모의 deps 에 넣으면 모드 변경마다 WebView 가 재마운트되어 worklets 충돌 + 지도 상태 유실 — 의도적으로 deps 에서 제외했다. 새 런타임 채널을 추가할 때 같은 분리 유지.
- **다크 배경 라벨 반전** -- `midnight`/`Satellite`(=`isDarkBaseLayer`) 위에서는 라벨 fill `#f8fafc` + stroke `#0f172a`. 새 어두운 레이어를 추가하면 `isDarkBaseLayer` 에도 넣어야 라벨이 안 묻힌다. 앱 HTML 은 `darkBg` 부울 + `__setMode` 가 같은 역할.
- **JS SDK 회귀 시 도메인 화이트리스트 부활** -- `vw.ol3.Map` 으로 되돌리면 콘솔 등록 도메인과 init URL host 가 정확히 일치해야 한다. WMTS 직접 호출이 이 부담을 통째로 뺀다.
- **(18차 갱신) `tileloaderror` 는 더 이상 1회 플래그가 아니다 — 연속 8회 + probe** -- 예전엔 첫 에러로 `errored=true` 영구 잠금이었지만, 그게 빠른 패닝의 일시적 실패까지 키 무효로 굳혀 회귀를 냈다. 이제 `consecutiveErrors` 카운터 + `tileloadend` 리셋 + 임계(8) 초과 시 키 probe 로 판정한다. 따라서 키가 정상이면 타일이 한 장만 성공해도 배너가 자동 해제된다. probe 가 401/403 을 받기 전까진 배너가 안 뜬다 — "키 바꿨는데 배너가 안 뜬다/안 사라진다" 면 probe 결과(저줌 z7 단일 타일)를 Network 탭에서 확인. `setUrl`(레이어 변경)은 같은 `tileSource` 라 핸들러/카운터가 유지된다.
- **programmatic 이동이 user 이동으로 잘못 분류되면 무한 재검색** -- 카드 클릭 → fly → moveend → 재검색 → URL 갱신 → 새로고침 → 또 fly … 무한 루프. `flyTo`/`flyToZoomIn`/`fitToMarkers` 가 호출 직전 `userInteractedRef = false` 로 강제 리셋하는 게 핵심. 새 imperative 메서드 추가 시 같은 패턴 필수.
- **declutter off → 핀 겹침은 라벨/스케일로만 회피** -- 웹 `MapCanvas` 가 declutter 를 꺼 줌 아웃 시 핀이 안 사라지지만 핀끼리 겹칠 수 있다. `LABEL_VISIBLE_ZOOM` 미만에서 라벨 끄고 핀 0.55 축소로 충돌 면적만 줄인다. 도심 밀집이 더 심해지면 클러스터링 검토 — **(2026-08)** 일상지도는 클라 클러스터링 대신 서버 셀 집계 + `fixedScale` 버블로 갔다(위 Key Decisions).
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

## Sources [coverage: high — 44 sources]

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
- [packages/utils/src/markerFrame.ts](../../packages/utils/src/markerFrame.ts) — *26×26 원 / 32×48 핀 공용 프레임 — 도메인 마커 빌더 전부가 사용*
- [packages/utils/src/airMarker.ts](../../packages/utils/src/airMarker.ts) — *new (2026-08-21): 측정소 등급색 마커 + 저장 위치 보라 점*
- [packages/utils/src/lifeMapMarker.ts](../../packages/utils/src/lifeMapMarker.ts) — *new (2026-08-21): CCTV 점/핀·화장실·병의원·집계 버블(fixedScale)*
- [packages/utils/src/vworld.ts](../../packages/utils/src/vworld.ts) — *VworldLayer / buildVworldTileUrl / probeVworldKey (lib 에서 utils 로 공용화)*
- [apps/web/src/stores/theme.ts](../../apps/web/src/stores/theme.ts) — *17차: MapCanvas 초기 레이어 결정 + 테마 추종*
- [apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) — *modified (2026-08): MapMarker.fixedScale + markerStyleCache(상한 6,000) + flyTo/flyToZoomIn opts.bottomInset(centerWithBottomInset) / (2026-07 대중교통 통합): poolKey 인스턴스 풀링(D안, mapPool·take·unByKey·레이어 승계) + overlayMarkers fit 제외 겸표시 레이어 / (18차): tileloaderror 연속 임계+키 probe 판정, 선택 마커 zIndex / (17차): 레이어 토글 + flyToZoomIn + 다크 라벨 반전 + 컨테이너 wrapper 분리*
- [apps/web/src/components/transit/transitMapViewport.ts](../../apps/web/src/components/transit/transitMapViewport.ts) — *new (2026-07): 탭 전환 뷰포트 이어보기 싱글턴(A안) — 풀링(D안)의 보완재*
- [apps/web/src/components/bus/BusStationsMap.tsx](../../apps/web/src/components/bus/BusStationsMap.tsx) — *new(참조): poolKey(transit-desktop/mobile)·overlayMarkers·initialViewport 배선 주 소비자. 대중교통 지도 래퍼는 [bus](bus.md)·[subway](subway.md)*
- [apps/web/src/components/admin/RegionStatsMap.tsx](../../apps/web/src/components/admin/RegionStatsMap.tsx) — *new (18차): 지역 통계 choropleth/버블/마커 지도 — MapCanvas 비경유 별도 OL Map, point-in-polygon 색칠*
- [apps/web/public/sigungu-geo.json](../../apps/web/public/sigungu-geo.json) — *new (18차): 시군구 경계 GeoJSON 에셋(2018 KOSTAT, mapshaper 4% 단순화, 552KB) — choropleth 지연 fetch*
- [apps/web/src/components/restaurant/MapLayerControl.tsx](../../apps/web/src/components/restaurant/MapLayerControl.tsx) — *new (17차): 좌하단 일반/다크/위성 토글 / modified (2026-08-22): --map-bottom-inset 만큼 위로*
- [apps/web/src/components/restaurant/MyLocationButton.tsx](../../apps/web/src/components/restaurant/MyLocationButton.tsx) — *new (17차): 공개+어드민 발견 공용 내 위치 버튼(denied/insecure 구분) / modified (2026-08-21): 'timeout' 상태 문구*
- [apps/web/src/components/air/AirStationsMap.tsx](../../apps/web/src/components/air/AirStationsMap.tsx) — *new (2026-08-21): 전국 측정소 지도 wrapper(poolKey 'air', icon 주입, overlayMarkers 내 위치/저장 위치)*
- [apps/web/src/components/air/AirNearbySection.tsx](../../apps/web/src/components/air/AirNearbySection.tsx) — *AirStationsMap 의 유일한 마운트 지점(단일 마운트 전제)*
- [apps/web/src/components/life-map/LifeMapView.tsx](../../apps/web/src/components/life-map/LifeMapView.tsx) — *new (2026-08-21): 일상지도 wrapper(poolKey 'life', 한 소스 3레이어, 상단 힌트 슬롯, 우하단 내 위치)*
- [apps/web/src/components/life-map/lifeMapMarkers.ts](../../apps/web/src/components/life-map/lifeMapMarkers.ts) — *new: 응답(점/셀) → MapMarker 변환, id 규약 `${layer}:${id}` / `cell:${layer}:${index}`*
- [apps/web/src/routes/LifeMapPage.tsx](../../apps/web/src/routes/LifeMapPage.tsx) — *useIsDesktopXl JS 분기(지도 한 장), flyTo bottomInset = sheetHalfInset 의 유일한 사용처*
- [apps/web/src/components/sheet/useMapSheets.ts](../../apps/web/src/components/sheet/useMapSheets.ts) — *SHEET_PEEK_HEIGHT(→ --map-bottom-inset)·sheetHalfInset(→ bottomInset)*
- [apps/web/src/components/restaurant/VWorldMap.tsx](../../apps/web/src/components/restaurant/VWorldMap.tsx)
- [apps/web/src/components/restaurant/PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx) — *modified (17차): MyLocationButton 추출, hoveredPlaceId 제거, zoomFocus 더블클릭 확대*
- [apps/web/src/components/admin/discover/DiscoverMap.tsx](../../apps/web/src/components/admin/discover/DiscoverMap.tsx) — *modified (17차): MyLocationButton/focusCoord/zoomFocus 도입(MY_LOCATION_ZOOM 16)*
- [apps/web/src/routes/admin/AdminSettingsPage.tsx](../../apps/web/src/routes/admin/AdminSettingsPage.tsx)
- [apps/web/src/routes/admin/AdminMapKeysPage.tsx](../../apps/web/src/routes/admin/AdminMapKeysPage.tsx)
- [apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx)
- [apps/mobile/src/components/PublicRestaurantsWebMap.native.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.native.tsx) — *modified (17차): theme.mode → __setMode 주입(다크 타일), tileError 토스트 surface 배경*
- [apps/mobile/src/components/PublicRestaurantsWebMap.web.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.web.tsx) — *modified (17차): theme.mode → postMessage(setMode)*
- [apps/mobile/src/components/publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts) — *modified (17차): mode 인자 + BASE/DARK 타일 URL + window.__setMode + 다크 배경/라벨 반전 — 맛집 전용 코어*
- [apps/mobile/src/components/transit/TransitMapView.native.tsx](../../apps/mobile/src/components/transit/TransitMapView.native.tsx) — *앱 범용 WebView 지도(대중교통 원산) — 대기·일상지도가 재사용, markerIcons prop*
- [apps/mobile/src/components/transit/transitMapHtml.ts](../../apps/mobile/src/components/transit/transitMapHtml.ts) — *modified (2026-08-22): 아이콘 사전 치환(fillMarkerSource icons), fixedScale 축소 제외*
- [apps/mobile/src/components/transit/transitMapBridge.ts](../../apps/mobile/src/components/transit/transitMapBridge.ts) — *modified (2026-08-22): BridgeMarker.fixedScale, setMarkers.icons*
- [apps/mobile/src/components/transit/useTransitMapSync.ts](../../apps/mobile/src/components/transit/useTransitMapSync.ts) — *modified (2026-08-22): markerIcons → setMarkers.icons*
- [apps/mobile/src/components/air/AirStationsMapCard.tsx](../../apps/mobile/src/components/air/AirStationsMapCard.tsx) — *new (2026-08-22): 앱 측정소 지도(TransitMapView 재사용, 아이콘 사전 `@air:{grade}:{s|b}`, 600ms 지연 flyToZoomIn)*
- [apps/mobile/src/components/lifeMap/lifeMapBridgeMarkers.ts](../../apps/mobile/src/components/lifeMap/lifeMapBridgeMarkers.ts) — *new (2026-08-22): 웹 lifeMapMarkers 와 같은 id 규약을 브리지 마커 + 아이콘 사전으로*
- [apps/mobile/app/life-map/index.tsx](../../apps/mobile/app/life-map/index.tsx) — *앱 일상지도 화면 — TransitMapView + markerIcons 소비자*
