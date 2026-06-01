---
topic: map
type: codebase
last_compiled: 2026-06-01
source_count: 22
status: active
aliases: [muted-marker, gray-pin, map-resize-observer, discover-map, registered-vs-search-marker, webview-vworld, fly-to-zoom, marker-fly, selected-marker-pin, label-always-visible, location-fly-bbox, public-restaurants-webview-map, line-icon, category-icon, restaurant-category-icon, declutter, zoom-label, compact-marker, generic-fork-knife-icon, my-location-button, geolocation-guide, insecure-context, native-location-permission-ux, open-settings-alert]
---

# map

**2026-06-01 변경 흡수 (16차, perf/UX 라운드 — 렌더 코어 무변경)** — 이번 라운드는 지도 도메인의 렌더링 코어(OpenLayers Map 인스턴스, 마커 빌더, 줌 임계값, declutter 정책)에 **변경 없음**. 두 파일이 터치됐지만 모두 지도 외곽의 위치 권한 UX 다듬기다: (1) 앱 [PublicRestaurantsWebMap.native.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.native.tsx) 의 "내 위치"(📍) 버튼이 `denied`/`unavailable` 상태에서 **비활성 대신 클릭 가능** — 누르면 먼저 silent refetch 를 시도하고, 여전히 막혀 있으면 `Alert.alert(...) + Linking.openSettings()` 로 시스템 설정 안내. `pending` 만 disabled. 한 번 거부한 사용자가 마음 바꿀 길을 열어둔다. 라운드 핵심 테마였던 "네이버 썸네일 프록시(thumbUrl) 마커 적용" 은 **이 컴포넌트에 도입되지 않았다** — 마커는 여전히 `id/lat/lng/name/categoryKey` 만 운반(이미지 없음). (2) 웹 [PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx) 의 `MyLocationButton` 도 같은 결로 [shared](shared.md) `useUserLocation` 의 `denied`/`unavailable` 구분을 받아 callout + refetch 처리. **웹 `MapCanvas` 는 React.memo 미적용** — `forwardRef(function MapCanvas...)` 그대로이며, 이미 콜백 ref 안정화 + 선택 채널 분리(N→2 restyle)가 들어 있어 추가 perf 터치 없음.

**2026-05-25 변경 흡수 — 카테고리별 라인 아이콘 8종 + variant 통합 + declutter 해제로 줌 아웃 마커 누락 수정**: (1) `MapMarker` 에 `categoryKey?: RestaurantCategoryKey | null` 추가. 한식/일식/중식/카페/디저트/바/양식/분식 8 카테고리를 SVG 라인 아이콘으로 핀 안쪽에 그린다. 자유 텍스트 카테고리("이자카야 > 술집", "디저트카페" 등) 는 [packages/utils/src/restaurantCategory.ts](../../packages/utils/src/restaurantCategory.ts) 의 `resolveRestaurantCategoryKey` 가 키워드 우선순위 매칭으로 정규화 (bar > dessert > cafe 처럼 더 좁은 의미 먼저). 매칭 실패는 generic 식기(포크+나이프) 아이콘. (2) primary(빨강)/muted(회색) variant + selected on/off + 8 + generic 조합을 단일 빌더 `buildRestaurantMarkerSvg` / `buildRestaurantMarkerDataUrl` 로 통합 — 웹(MapCanvas) 과 앱(publicRestaurantsMapHtml) 이 정확히 같은 SVG 를 그린다. (3) **줌 아웃 마커 누락 수정** — 웹 MapCanvas 의 `VectorLayer` declutter 옵션 해제 + 줌 임계값(`LABEL_VISIBLE_ZOOM=14`) 기준으로 라벨만 토글, 작은 줌에서는 핀도 `SMALL_ICON_SCALE=0.55` 로 축소해 충돌 자체를 줄였다. OL declutter 가 feature 단위라 라벨이 겹치면 핀까지 통째로 가려지던 회귀 종결.

## Purpose [coverage: high -- 7 sources]

vworld 지도 타일을 OpenLayers 위에 직접 그려, 세 화면에 한 가지 렌더링 코어를 공급하는 도메인. 첫째는 어드민 식당 상세 페이지 우측 사이드바의 단일 마커 위치 카드(작은 사이드 박스 + 우측 슬라이드오버 풀 사이즈), 둘째는 공개 `/restaurants` 지도 페이지의 다중 마커 + "이 지역에서 재검색" 위젯, 셋째는 어드민 발견(`/admin/discover`) 페이지의 검색 결과·등록 맛집 합성 마커 화면이다. 어드민 키 등록·연결 테스트 UI(`/admin/settings/map`) 까지가 이 도메인의 책임 범위 — friendly 의 `MapProviderConfig` 테이블에서 시작해 web 의 OpenLayers `Map` 인스턴스까지 끊김 없이 한 줄로 이어진다.

키는 운영자가 vworld 콘솔에서 발급받아 어드민 화면에 붙여넣어 등록한다. 어드민 화면은 평문 `apiKey` 를 다시 받아 `probeVworldKey` 로 한 장 타일을 fetch 해 보고 OK/거부를 즉시 보여준다. 같은 키를 공개 페이지가 호출할 수 있도록 `/api/v1/settings/map/public` 만 인증 없이 열어두고, 어드민 보호 라우트와 평문 응답을 그대로 공유한다 (보안 등급 동일 — 키는 어차피 브라우저 Network 탭에 노출되는 클라이언트 사이드 자원).

`MapCanvas` 호출자 요약:

| 호출자 | 라우트 | 마커 | variant | categoryKey |
|---|---|---|---|---|
| `VWorldMap` | 어드민 식당 상세 사이드 카드 + 슬라이드오버 | 1개 | primary | 미사용 (단일 핀) |
| `PublicRestaurantsMap` | 공개 `/restaurants` | N개 (검색 결과) | primary | `resolveRestaurantCategoryKey(it.category)` |
| `DiscoverMap` | 어드민 `/admin/discover` | N개 (검색 + 등록 합성) | primary (검색) / muted (등록) | (옵션 — 합성 데이터에 따라) |

## Architecture [coverage: high -- 10 sources]

저레벨 캔버스 한 개와 세 개의 화면별 wrapper 로 구성되고, 모바일(WebView/iframe) 측에 동형 코어가 한 벌 더 있다.

1. **`MapCanvas`** ([apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx)) — vworld WMTS 키를 받아 OpenLayers `Map` 인스턴스를 만들고, 마커 배열·선택 상태·viewport 콜백·tile 에러 콜백을 props 로 받는다. 마커 클릭 → `onMarkerSelect`, 사용자 패닝/줌 → `onViewportChangeEnd`, 모든 viewport 변경 → `onViewportSync`. `useImperativeHandle` 로 `flyTo` / `fitToMarkers` 를 외부에 노출 — 카드 호버 시 부드럽게 마커로 이동하는 식의 imperative 동작 전용.
2. **`VWorldMap`** ([apps/web/src/components/restaurant/VWorldMap.tsx](../../apps/web/src/components/restaurant/VWorldMap.tsx)) — 어드민 식당 상세 단일 마커 wrapper. `useMapProviderSecret('vworld')` 로 평문 키를 가져와 `MapCanvas` 에 박는다. 좌표 누락/키 누락/로딩/타일에러 4가지를 `<Placeholder>` 로 분기. 한 줄짜리 컴포넌트 — 책임은 admin secret hook + placeholder UI 뿐.
3. **`PublicRestaurantsMap`** ([apps/web/src/components/restaurant/PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx)) — 공개 `/restaurants` 지도 wrapper. `useMapPublicConfig` (인증 없는 라우트) 로 키 가져옴. 각 마커에 `categoryKey: resolveRestaurantCategoryKey(it.category)` 를 박아 카테고리 아이콘이 핀 안에 들어가도록 한다. 마커 hover/select 동기화, "이 지역에서 재검색" 버튼, "전체 영역" 토글, 그리고 "내 위치"(`MyLocationButton`) 가 여기 살고, 핸들 ref 로 `flyTo` 를 호출해 카드 호버를 마커 이동에 매핑한다. **(2026-05-31)** `MyLocationButton` 이 [shared](shared.md) 의 `useUserLocation` 상태(`denied`/`unavailable`)를 받아, 권한 차단·평문 HTTP 는 비활성 대신 해제 방법 callout + refetch 로 처리(미지원만 비활성) — 지도 렌더 코어와 무관한 위치 권한 UX 라 자세한 건 [web](web.md)·[shared](shared.md).
4. **`DiscoverMap`** ([apps/web/src/components/admin/discover/DiscoverMap.tsx](../../apps/web/src/components/admin/discover/DiscoverMap.tsx)) — 어드민 발견(`/admin/discover`) 페이지 wrapper. 검색 결과(빨강) + 이미 등록된 맛집(회색) 을 한 지도에 합성. 같은 placeId 가 양쪽에 있으면 `muted` 우선해 중복 크롤 방지. 디테일은 [web](web.md) 토픽 참고.
5. **`PublicRestaurantsWebMap`** (앱 — [.native.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.native.tsx) / [.web.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.web.tsx)) — 앱(iOS/Android/Expo Web) 의 공개 맛집 지도. WebView 또는 iframe 안에 [publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts) 의 인라인 HTML(OpenLayers + vworld WMTS) 을 그대로 띄운다. 웹 `PublicRestaurantsMap` 과 동일 입력(`items`, `selectedPlaceId`, `appliedBbox`, `focusCoord`) 을 받고 `resolveRestaurantCategoryKey` 로 카테고리를 정규화해 HTML 에 전달 — 결과적으로 웹과 앱이 동일한 카테고리 아이콘을 그린다. **(2026-06-01)** 우측 상단 "내 위치"(📍) 버튼은 `locationStatus`(`useUserLocationNative` 결과) + `onRequestLocation()` 콜백을 props 로 받는다. `pending` 만 disabled, `denied`/`unavailable` 도 클릭 가능 — `handleLocationPress` 가 먼저 `await onRequestLocation()` 로 silent refetch 한 뒤 결과가 `granted` 면 그대로 종료(부모 effect 가 `focusCoord` 갱신 → `__flyTo`), 여전히 막혀 있으면 `Alert.alert('위치 권한 필요', …)` 에서 "설정 열기" → `Linking.openSettings()`. 시각적으로 흐리게(opacity) 처리하지 않고 "다른 동작" 임을 암시 — 한 번 거부한 사용자가 시스템 설정으로 갈 길을 연다. 마커 데이터에는 이미지/썸네일 없음 — `id/lat/lng/name/categoryKey` 만 운반.

### 마커 스타일 — variant + categoryKey 통합 빌더

`MapCanvas` 의 `MapMarker` 는 색 분기(`variant`) 와 카테고리 분기(`categoryKey`) 두 축을 동시에 받는다.

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

`MapCanvas` 는 컨테이너 사이즈 변화를 자체 감지한다. `ResizeObserver` 가 `containerRef` 를 관찰하다가 변동 시 `map.updateSize()` 를 자동 호출, cleanup 에서 `disconnect()` 한다. OpenLayers 는 컨테이너 reflow 를 자체적으로 감지하지 않아 호출자가 명시적으로 `updateSize()` 를 부르지 않으면 패널 토글 직후 지도가 일그러질 수 있는데, 이걸 컴포넌트 레벨에서 한 번에 흡수한다 — 좌/우 패널 토글 (어드민 발견, 공개 맛집), 윈도우 리사이즈, 어드민 detail 슬라이드오버 모두 호출자가 신경쓸 일이 없다.

### 줌 임계값 — 라벨만 토글, 핀은 축소

웹 `MapCanvas` 의 vector layer 는 declutter 를 **끔**. 대신 style function 안에서 줌을 직접 읽어 분기한다:

- `selected === true` : 항상 풀사이즈 핀 + 라벨
- `zoom >= LABEL_VISIBLE_ZOOM (14)` : 풀사이즈 핀 + 라벨
- `zoom <  LABEL_VISIBLE_ZOOM (14)` : `SMALL_ICON_SCALE (0.55)` 배율 축소 핀 + 라벨 없음

이렇게 두면 줌 아웃 시 한꺼번에 뜨는 라벨이 핀과 함께 declutter 되어 사라지는 회귀가 일어나지 않는다 (구버전은 `declutter:true` 한 줄로 라벨 충돌 처리하려다 줌 아웃 시 핀까지 통째로 가려졌음).

앱 측 [publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts) 는 동일 의도지만 구현이 약간 다르다 — `VectorLayer({ declutter: true })` 를 유지하면서 모든 마커에 라벨을 박고, 도심 밀집 지역에서 글자 충돌만 OL 이 자동 숨김. 웹은 줌 임계값으로 핀 자체를 축소, 앱은 라벨 충돌을 OL declutter 로 흡수 — 둘 다 "줌 아웃 시 핀이 사라지지 않는다" 는 같은 결과에 도달.

### 모바일 (WebView/iframe) 동형 코어

[publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts) 은 빌드 시점에 18개(8 카테고리 + generic, 각 선택/비선택) data URL 을 미리 만들어 HTML 의 `ICONS` 객체에 inject. 런타임은 `ICONS[catKey] || ICONS['_']` 한 줄 lookup. RN ↔ Web 채널은 `__setMarkers` / `__setSelected` / `__flyTo` 세 함수로 분리 — selection 변경이 vectorSource clear + N개 feature 재생성을 일으키지 않도록 selection 채널을 떼어내 `prev/next` 두 setStyle 만 수행한다 (Reanimated 워클릿 폭주 회피 + 성능).

키 저장은 `MapProviderConfig` 테이블 단일. AI 키와 같은 patten 이지만 모델/동시성 같은 LLM 옵션이 없어 더 단순하다 — `provider` 유니크 키 + `apiKey` 평문 + `domains` 자유 메모 + `updatedAt`/`updatedById` 가 끝.

라우트는 admin 보호 4개 + 공개 1개로 분리 ([apps/friendly/src/modules/settings/map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)):

```
GET    /api/v1/admin/settings/map              -- list + 합성 빈 행 (vworld)
PUT    /api/v1/admin/settings/map/:id          -- upsert (apiKey 빈문자열은 무시)
DELETE /api/v1/admin/settings/map/:id          -- 행 삭제
GET    /api/v1/admin/settings/map/:id/secret   -- 평문 키 (admin 가드)
GET    /api/v1/settings/map/public             -- 평문 키 (공개; 미등록 시 404)
```

URL helper 는 `Routes.SettingsMap` ([packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) line 124-130) 한 자리에서 정의.

지원 provider 는 zod enum `MapProviderId = z.enum(['vworld'])` ([packages/api-contract/src/schemas/settings-map.ts](../../packages/api-contract/src/schemas/settings-map.ts)) — 카카오/네이버 추가 시 enum 만 늘리면 된다. 현재 `MapSettingsService.list()` 가 `known: MapProviderIdType[] = ['vworld']` 를 상수로 들고 있어 실제 row 가 없어도 빈 카드 한 장은 늘 응답에 들어간다.

## Talks To [coverage: high -- 9 sources]

- **friendly DB (`MapProviderConfig`)** -- 평문 키 1행 저장. AI 와 달리 env fallback 없음 — vworld 키는 운영자가 콘솔에서 직접 발급받는 1:1 자원이라 `.env` 기본값 개념이 어색하다 ([map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts) line 11-13).
- **vworld API CDN (`https://api.vworld.kr/req/wmts/1.0.0/`)** -- 직접 타일만 호출. JS SDK (`vw.ol3.Map`) 는 안 쓴다 — SDK 는 init URL 의 도메인 화이트리스트 검증이 fragile (localhost/staging/prod 마다 별도 등록). WMTS 직접 호출은 키만 검증하고 origin 검증을 안 해서 어떤 origin 에서도 동작한다 ([apps/web/src/lib/vworld.ts](../../apps/web/src/lib/vworld.ts) line 1-3).
- **api-contract (zod 스키마)** -- `MapProviderId`, `MapProviderConfig`, `MapProviderListResult`, `UpdateMapProviderInput`, `MapProviderSecret`, `MapProviderPublicConfig`. `Routes.SettingsMap` 5개 URL helper.
- **`@repo/utils` (`restaurantCategory.ts`)** -- `resolveRestaurantCategoryKey`, `buildRestaurantMarkerSvg`, `buildRestaurantMarkerDataUrl`, `RESTAURANT_CATEGORY_KEYS`. 자유 텍스트 카테고리 → 8키 정규화 + 마커 SVG 빌더를 한 자리에 둬서 웹/앱이 정확히 같은 핀 디자인을 그린다.
- **shared (`settingsMapApi`, `useSettingsMap`)** -- `list/update/remove/getSecret/publicConfig` API 함수와 동명 React Query hooks. `useUpdateMapProvider` 의 `onSuccess` 가 secret 캐시도 같이 invalidate — stale 키로 OL `Map` 이 init 되면 도메인 화이트리스트 가설 하에 (혹시라도) 거부될 수 있어 보수적으로 같이 비운다 ([useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts) line 24-30).
- **admin UI** -- `AdminSettingsPage` 가 탭 컨테이너 (AI 키 / 지도 두 탭), `AdminMapKeysPage` 가 provider 카드 + 폼 + 연결 테스트, `AdminLayout` sidebar 의 "설정" 항목이 진입점.
- **admin restaurant detail** -- `AdminRestaurantDetailPage` 의 우측 사이드바 카드(280px) + Maximize2 버튼 → Radix Dialog 우측 슬라이드오버 (740px) 에 별도 `VWorldMap` 인스턴스. 한 OL Map 을 두 컨테이너로 옮기는 setTarget 트릭은 view/layer 상태가 어색해져 안 쓴다 — 두 인스턴스 비용은 무시할 만하다 ([AdminRestaurantDetailPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx) line 700-706 주석).
- **public restaurants page** -- `RestaurantsPage` (라우트 `/restaurants`) → `PublicRestaurantsMap` 가 `appliedBbox` URL 쿼리와 viewport 변경을 비교해 "이 지역에서 재검색" 버튼을 토글.
- **admin discover page** -- `AdminDiscoverPage` (라우트 `/admin/discover`) → `DiscoverMap` ([apps/web/src/components/admin/discover/DiscoverMap.tsx](../../apps/web/src/components/admin/discover/DiscoverMap.tsx)) 가 검색 결과 (`primary`) 와 이미 등록된 맛집 (`muted`) 을 한 지도에 합성해 `MapCanvas` 로 넘긴다. 같은 placeId 가 양쪽에 있으면 muted 우선 — 중복 크롤 방지를 위해 회색 핀이 검색 빨강을 가린다.

## API Surface [coverage: high -- 7 sources]

**HTTP — admin (인증 + ADMIN 가드, [map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)):**

- `GET Routes.SettingsMap.list` → `{ providers: MapProviderConfig[] }`. 등록 row 가 없어도 `vworld` 한 장이 항상 합성된 빈 카드로 들어옴 (`hasApiKey: false`, `apiKeyMasked: null`).
- `PUT Routes.SettingsMap.provider(:id)` body=`UpdateMapProviderInput` → `MapProviderConfig`.
  - `apiKey?: string` — 빈/생략은 보존 (변경 안 함). 첫 등록인데 키가 비어 있으면 `400 API 키가 필요합니다`.
  - `domains?: string|null` — `undefined` 보존 / `null` 클리어 / 문자열 set.
- `DELETE Routes.SettingsMap.provider(:id)` → 204 (행 삭제, idempotent — 행이 없어도 204).
- `GET Routes.SettingsMap.secret(:id)` → `{ provider, apiKey: string|null, domains: string|null }`. admin 가드 통과 후 평문 반환. AdminMapKeysPage 의 "연결 테스트" 와 별개로, 어드민 reveal 본 목적은 변경 전 현재 값 확인용.

**HTTP — public (인증 없음):**

- `GET Routes.SettingsMap.publicConfig` → `{ provider: 'vworld', apiKey: string }`. 키 미등록이면 `404 지도 키가 등록되지 않았습니다`. 호출자가 `ApiError.statusCode === 404` 로 분기해 placeholder 노출 ([PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx) line 43-44).

**Zod 계약 ([settings-map.ts](../../packages/api-contract/src/schemas/settings-map.ts)):**

| Schema | 형태 |
|---|---|
| `MapProviderId` | `z.enum(['vworld'])` |
| `MapProviderConfig` | `{ provider, hasApiKey, apiKeyMasked, domains, updatedAt }` (기본 GET — 마스킹된 키만) |
| `MapProviderSecret` | `{ provider, apiKey: nullable, domains: nullable }` (admin 평문) |
| `MapProviderPublicConfig` | `{ provider, apiKey: string }` (공개 평문, 미등록 시 라우트가 404) |
| `UpdateMapProviderInput` | `{ apiKey?: string, domains?: string\|null }` (`undefined` = no change, `null` = clear) |

**FE hooks ([useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts)):**

- `useMapProviders()` — `['settings', 'map', 'providers']` (어드민 카드 리스트).
- `useUpdateMapProvider()` — onSuccess 시 providers + secret 캐시 둘 다 invalidate.
- `useDeleteMapProvider()` — 동일 캐시 invalidate.
- `useMapProviderSecret(id, enabled=true)` — admin 식당 상세에서. `staleTime: Infinity` + `gcTime: Infinity` (키는 자주 안 바뀜). `enabled` 로 좌표 없는 카드에서 secret 호출을 차단.
- `useMapPublicConfig(enabled=true)` — 공개 페이지. 동일 무한 캐시. `retry: false` — 404 (키 미등록) 는 정상 상태이므로 자동 retry 안 함.

**`MapCanvas` props ([MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx)):**

```ts
interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  variant?: 'primary' | 'muted';                         // 'primary' default — 빨강 핀.
                                                          // 'muted' — 회색 핀 (등록된 맛집 표시용).
  categoryKey?: RestaurantCategoryKey | null;            // 8 카테고리 또는 null(generic 식기).
                                                          // muted variant 에서도 동일하게 안쪽에 그려진다.
}
interface Props {
  apiKey: string;
  markers: MapMarker[];
  selectedMarkerId?: string | null;
  initialCenter?: { lat: number; lng: number; zoom?: number };
  onMarkerSelect?(markerId: string): void;
  onViewportChangeEnd?(viewport: MapViewport): void;     // 사용자 패닝/줌 종료 — programmatic 무시
  onViewportSync?(viewport: MapViewport): void;          // 모든 viewport 변경 (첫 렌더 포함) — 검색에 bbox 자동 첨부
  onTileError?(): void;                                  // 첫 tileloaderror 한 번만
  className?: string;
}
interface MapCanvasHandle {
  flyTo(lat: number, lng: number, zoom?: number): void;
  fitToMarkers(padding?: number): void;
}
interface MapViewport {
  centerLng: number; centerLat: number; zoom: number;
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number };
}
```

**`VWorldMap` props ([VWorldMap.tsx](../../apps/web/src/components/restaurant/VWorldMap.tsx)):**

```ts
interface Props {
  lat: number | null;
  lng: number | null;
  name: string;          // 마커 라벨 + Dialog 타이틀
  className?: string;    // 사이즈 오버라이드 — 기본 'h-[280px] w-full'
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

// 자유 텍스트 → 8키 정규화. 우선순위 매칭 (bar > dessert > cafe > japanese …).
export function resolveRestaurantCategoryKey(
  category: string | null | undefined,
): RestaurantCategoryKey | null;

// SVG 문자열 — 비선택 26×26 원 / 선택 32×48 핀. 안쪽에 카테고리 라인 아이콘.
export function buildRestaurantMarkerSvg(
  key: RestaurantCategoryKey | null,
  selected: boolean,
  variant?: RestaurantMarkerVariant,  // default 'primary'
): string;

// data:image/svg+xml URL — OL Icon.src 에 그대로 박는다. 웹/앱 동일 사용.
export function buildRestaurantMarkerDataUrl(
  key: RestaurantCategoryKey | null,
  selected: boolean,
  variant?: RestaurantMarkerVariant,
): string;
```

키워드 우선순위 (`KEYWORD_TABLE`):

| 순위 | 키 | 트리거 키워드 (예시) |
|---|---|---|
| 1 | `bar` | 이자카야 / 포차 / 호프 / 술집 / pub |
| 2 | `dessert` | 디저트 / 베이커리 / 빵집 / 케이크 |
| 3 | `cafe` | 카페 / 커피 / coffee |
| 4 | `japanese` | 일식 / 초밥 / 라멘 / 우동 |
| 5 | `chinese` | 중식 / 짜장 / 마라 / 딤섬 |
| 6 | `western` | 양식 / 파스타 / 피자 / 버거 |
| 7 | `snack` | 분식 / 떡볶이 / 김밥 |
| 8 | `korean` | 한식 / 백반 / 곰탕 / 불고기 |

`bar > dessert > cafe` 순서가 핵심 — "이자카야 > 일식 > 술집" 같은 표시는 술집 의미가 더 직관적이고, "디저트카페" 는 카페보다 디저트가 더 두드러진다.

**`probeVworldKey(apiKey)` ([apps/web/src/lib/vworld.ts](../../apps/web/src/lib/vworld.ts) line 21-35):** `WMTS/{KEY}/Base/7/44/109.png` 한 장을 fetch. `200` + `content-type: image/*` 면 OK. 어드민 카드의 "연결 테스트" 버튼이 호출.

## Data [coverage: high -- 3 sources]

`MapProviderConfig` ([schema.prisma](../../apps/friendly/prisma/schema.prisma) line 56-72, [migration](../../apps/friendly/prisma/migrations/20260508173216_add_map_provider_configs/migration.sql)):

```
id          String   @id @default(cuid())
provider    String   @unique     -- 'vworld' (현재). 카카오/네이버 추가 가능성.
apiKey      String                -- 평문. admin secret + public 라우트 모두 그대로 반환.
domains     String?               -- vworld 콘솔에 등록된 도메인 화이트리스트 메모. 콤마 구분
                                     자유 입력. 서버는 검증 안 함 — UI 카드의 운영자 메모용.
updatedAt   DateTime @updatedAt
updatedById String?               -- 마지막 수정한 admin user id (감사 로그).
```

`provider` 유니크 — 한 provider 당 정확히 한 행. `MapSettingsService.list` 가 `known = ['vworld']` 를 상수로 들고 빈 행을 합성하므로 DB 가 비어 있어도 어드민 화면이 깨지지 않는다 ([map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts) line 17-22).

`apiKeyMasked` 는 GET 응답 가공용 — `maskApiKey` ([ai.config.service.ts](../../apps/friendly/src/modules/ai/ai.config.service.ts) 재사용) 가 앞 4자리 + `***` + 뒤 4자리 형태로 줄인다. 평문 키는 secret/publicConfig 라우트를 거쳐야만 나온다.

env fallback 없음 — `.env` 에 vworld 키를 두지 않는다. 이유는 [Key Decisions](#key-decisions-coverage-high----14-sources) 참고.

## Key Decisions [coverage: high -- 14 sources]

- **vworld JS SDK 거부, OpenLayers + WMTS 직접** -- vworld JS SDK (`vw.ol3.Map`) 는 init URL 에 등록된 도메인 화이트리스트를 매칭한다. localhost/staging/prod 마다 별도 키 또는 콘솔 등록이 필요해 fragile. WMTS 직접 호출은 키만 검증하고 origin 검증을 안 한다. v1 niney-life-pickr 도 같은 결정 — OpenLayers + WMTS 조합은 검증 끝.
- **WMTS endpoint 형태** -- `https://api.vworld.kr/req/wmts/1.0.0/{KEY}/{LAYER}/{z}/{y}/{x}.png`. layer 는 `Base`/`gray`/`midnight`/`Satellite`/`Hybrid`. 현재 `MapCanvas` 는 `Base` 고정. 위성/다크 등 추가가 필요해지면 prop 으로 노출.
- **tile load 에러 1회 플래그** -- `tileSource.on('tileloaderror', ...)` 핸들러는 한 번 발화 후 `errored = true` 로 잠근다. 한 화면에 타일 수십 장이 동시에 실패할 수 있어 필터링 안 하면 onTileError 가 폭주. 실제로 키가 거부됐는지 한 번만 알면 된다 ([MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) line 129-134).
- **DB 저장 (`MapProviderConfig`) vs env/yaml** -- 어드민 UI 에서 운영자가 직접 등록·수정·삭제·테스트할 수 있어야 한다. `LlmProviderConfig` 와 같은 패턴. env fallback 을 두지 않는 이유는 vworld 키가 운영자가 콘솔에서 도메인과 짝지어 발급받는 1:1 자원이라 "기본값" 개념이 어색하기 때문 ([map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts) line 11-13).
- **admin secret + public 라우트 보안 등급 동등** -- 분리는 라우트 명/가드만. WMTS 키는 어차피 브라우저 Network 탭에 평문으로 노출되는 클라이언트 사이드 자원이라 "secret" 이라는 이름은 어드민 관리상의 의미일 뿐 실제 비밀이 아니다. 공개 페이지가 admin 가드를 통과 못 하니 라우트만 분리. 어드민의 "현재 키 reveal" 기능을 위해 admin 라우트도 별도로 둔다 ([map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts) line 84-99).
- **`MapCanvas` vs `VWorldMap` 분리** -- 원래 `VWorldMap` 한 컴포넌트 (어드민 단일 마커 전용) 였다. 공개 `/restaurants` 의 다중 마커 + viewport 콜백 + imperative API 요구가 들어오면서 저레벨 wrapper 인 `MapCanvas` 를 추출. 지금 `VWorldMap` 은 placeholder 분기 + admin secret hook 만 담당하는 thin wrapper.
- **imperative API (`flyTo`/`fitToMarkers`)** -- `useImperativeHandle` 로 ref 메서드 노출. 카드 호버 → 마커 이동은 외부 시스템 (OL Map) 동기화에 가까운 side effect 지 derived state 가 아니다 — 매번 props 로 좌표를 내려보내는 declarative 방식은 `<select>` 의 controlled/uncontrolled 같은 어색함을 만든다. ref + animate 가 자연스럽다.
- **사용자 vs programmatic 이동 구분** -- OL `moveend` 는 둘 다 발화한다. 처음 mount 시 `setCenter`/`animate` 한 번 도는 자동 이동까지 잡으면 페이지 로드와 동시에 "이 지역에서 재검색" 버튼이 뜨는 버그. `pointerdrag` + 컨테이너의 `wheel` 이벤트에 hook 을 박아 사용자 인터랙션이 시작된 적 있을 때만 `userInteractedRef = true` 로 마크한다. `flyTo`/`fitToMarkers` 는 호출 직전 `userInteractedRef = false` 로 재설정해 자기 자신이 발사한 moveend 를 무시한다 ([MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) line 158-165, 184-202).
- **키 미등록은 placeholder** -- 공개 페이지는 `useMapPublicConfig` 의 `error.statusCode === 404` 로 분기, "관리자가 설정 > 지도에서 vworld 키를 등록하면 표시됩니다" 안내. 어드민 식당 상세는 `useMapProviderSecret` 결과의 `apiKey === null` 분기에 `Link to="/admin/settings/map"` 으로 직행. 둘 다 빈 회색 사각형이 아니라 다음 행동이 명시된 카드.
- **카테고리별 라인 아이콘 — 단순 핀에서 8종 시각 분류로** -- 모든 마커가 똑같은 빨간 핀이면 리스트 vs 지도 간 인지 비용이 크다 (어떤 핀이 한식인지, 카페인지 매번 라벨 읽어야 함). [packages/utils/src/restaurantCategory.ts](../../packages/utils/src/restaurantCategory.ts) 의 키워드 정규화 + 8종 라인 아이콘으로 색은 그대로 두고 안쪽 아이콘으로만 분류. 라인 아이콘은 작은 크기(축소 26×26 → 14px)에서도 형태가 인식되도록 stroke 폭/디테일을 최소화. 백엔드 category 가 자유 텍스트("이자카야 > 술집", "디저트카페") 라 매칭 우선순위가 핵심 — 더 좁은 의미(bar/dessert) 가 먼저 매칭되어야 한다.
- **마커 스타일 — SVG data-URL Icon 단일 빌더 (variant + categoryKey 통합)** -- 외부 이미지 의존성 없이 한 폴더 안에서 닫힌다. variant(primary/muted) × selected(on/off) × category(8 + null) = 36 조합을 하나의 `buildRestaurantMarkerSvg(key, selected, variant)` 가 처리. 핀 모양/사이즈는 selected, 외곽 색은 variant, 안쪽 아이콘은 categoryKey 가 결정해 분기가 독립적이다. 모바일 HTML 은 빌드 시점에 18개(웹과 달리 variant 는 primary 만 — 공개 페이지는 muted 미사용) data URL 을 미리 만들어 inject 해 런타임 비용 0.
- **`MapMarker.variant` 로 marker 색 분기 — 어드민 발견의 검색·등록 통합 마커** -- 어드민 발견 페이지에서 검색 결과(빨강 `primary`) 와 이미 등록된 맛집(회색 `muted`) 을 한 지도에 합성해 보여줘야 한다. 같은 placeId 가 양쪽에 있으면 `muted` 우선해 회색 핀이 빨강을 가리고, 운영자가 "이미 등록됨"을 시각적으로 인지해 중복 크롤을 피한다. 별도 layer 가 아니라 `markers` 배열에 `variant` 만 다르게 박아 한 layer 에서 처리.
- **`VectorLayer` declutter 해제 + 줌 임계값 라벨 토글 (줌 아웃 마커 누락 수정)** -- OL declutter 는 feature 단위(이미지 + 라벨 한 묶음) 라 라벨이 다른 feature 와 겹치면 핀까지 통째로 가린다. 줌 아웃 시 라벨 간 충돌이 폭증하면서 멀쩡한 핀들이 한꺼번에 사라지는 회귀가 발생. 웹은 declutter 를 꺼서 핀은 항상 표시, 대신 style function 안에서 줌을 읽어 `zoom < 14` 면 라벨을 빼고 핀까지 `SMALL_ICON_SCALE = 0.55` 로 축소해 핀 자체의 겹침도 줄였다. 라벨 충돌 처리 책임은 OL 에서 우리 쪽으로 넘어왔지만, "줌 아웃 시 마커가 사라지지 않는다" 가 더 중요한 UX. 모바일 HTML 은 라벨까지 그리되 declutter 를 켜서 라벨만 자동 숨김 — 두 환경의 인터랙션 모델이 달라 (마우스 호버 vs 터치) 선택을 다르게 갔다.
- **ResizeObserver 자동 reflow — `map.updateSize()` 분산 호출 회피** -- OpenLayers 는 컨테이너 사이즈 변화를 자체 감지하지 않고 `updateSize()` 를 명시적으로 불러야 한다. 호출자(좌/우 패널 토글, 윈도우 리사이즈, 어드민 detail 슬라이드오버 등) 마다 같은 코드를 반복하는 대신 `MapCanvas` 가 `ResizeObserver` 로 컨테이너를 관찰하고 자동 호출. cleanup 에서 `disconnect()`. 호출자는 사이즈 변경을 신경쓸 필요가 없다.

## Gotchas [coverage: high -- 9 sources]

- **JS SDK 회귀 시 도메인 화이트리스트 부활** -- 만약 누군가 `vw.ol3.Map` 으로 되돌리면 vworld 콘솔에 등록된 도메인과 init URL host 가 정확히 일치해야 한다. `localhost:5173` / `localhost:5174` / staging / prod 다 따로 등록하거나 `*` 와일드카드를 콘솔이 허용하는지 확인 필수. WMTS 직접 호출이 이 부담을 통째로 빼는 이유.
- **`tileloaderror` 플래그는 세션당 1회** -- 한 번 에러를 본 후엔 `errored = true` 로 잠겨 더 이상 콜백이 안 뜬다. 키를 바꾸고도 재시도 시 시각 알림이 안 뜰 수 있으니, 키 변경 후엔 페이지 새로고침이 가장 확실 (or `apiKey` 변경으로 effect 가 통째로 재실행 — 그러면 새 `tileSource` 가 만들어져 플래그도 리셋).
- **programmatic 이동이 user 이동으로 잘못 분류되면 무한 재검색** -- 카드 클릭 → 마커로 fly-to → moveend → 재검색 표시 → URL 갱신 → 데이터 새로고침 → 또 fly-to … 무한 루프. `flyTo`/`fitToMarkers` 가 호출 직전 `userInteractedRef = false` 로 강제 리셋하는 게 이 루프를 끊는 핵심. 새 imperative 메서드를 추가할 때 같은 패턴 유지 필수.
- **declutter off → 핀 겹침은 라벨/스케일로만 회피** -- 웹 `MapCanvas` 가 declutter 를 꺼서 줌 아웃 시 핀이 사라지진 않지만 핀끼리 직접 겹칠 수 있다. 현재는 `LABEL_VISIBLE_ZOOM` 미만에서 라벨을 끄고 핀을 0.55 배로 축소해 충돌 면적을 줄여 가시 피해를 최소화. 도심 밀집 지역에서 핀이 빽빽이 쌓이는 케이스가 더 심해지면 (예: 줌 아웃 시 클러스터링) 추가 처리 필요 — 별도 layer 와 ol-ext `Cluster` 도입을 고려.
- **카테고리 매핑 누락 시 generic 식기 아이콘 fallback** -- `resolveRestaurantCategoryKey` 가 매칭 실패하면 `null` 반환 → `buildRestaurantMarkerSvg(null, …)` 가 generic 식기(포크+나이프) 아이콘을 그린다. 빈 핀(아이콘 없음) 이 아니어서 다른 카테고리 핀과 시각적 위화감이 없다. 새 카테고리 키워드(예: "베트남 쌀국수") 가 자주 나오면 `KEYWORD_TABLE` 에 항목 추가 — 우선순위는 더 좁은 의미를 위쪽에 둔다.
- **카테고리 우선순위 — bar > dessert > cafe > japanese 등** -- 단순 첫 매칭이 아니라 의도된 순서다. "이자카야 > 일식 > 술집" 분류는 술집 의미가 더 직관적이고, "디저트카페" 는 카페보다 디저트 비중이 더 큰 인지 모델. 이 순서를 바꾸면 같은 식당이 다른 아이콘으로 표시되어 사용자 혼란. 새 카테고리 추가 시 `KEYWORD_TABLE` 의 순서를 신중히 골라야 한다 ([restaurantCategory.ts](../../packages/utils/src/restaurantCategory.ts) line 21-36 주석 참고).
- **모바일 HTML 의 18개 아이콘 캐시는 빌드 시점에 inline** -- `publicRestaurantsMapHtml.ts` 가 HTML 문자열 안에 18개 data URL 을 모두 넣고 inject 하므로 HTML 페이로드가 약 20KB 정도 더 무거워진다. WebView/iframe 한 번 mount 후엔 무관 — 다만 키나 initial center 가 매번 다르면 매 mount 마다 빌드되니, native 코드의 `initialHtmlRef` 캐시 (`apiKey` 변경 시에만 재빌드) 가 지워지지 않도록 주의. 같은 키 + 새 initial center 시점에 의도적으로 HTML 재빌드를 막는 게 worklets 충돌 회피의 핵심.
- **평문 키 노출은 의도** -- 어드민 secret 라우트와 public publicConfig 라우트 모두 키를 평문으로 응답한다. WMTS 호출이 어차피 클라이언트에서 일어나기 때문. 보안 등급 차이가 있는 것처럼 라우트를 분리한 건 단지 admin guard vs 비로그인 분리이고 응답 데이터 민감도는 동일.
- **선택된 마커만 풀라벨, 비선택은 줌 의존** -- 다중 마커 페이지에서 모든 마커에 식당명을 띄우면 시각이 망가진다. 웹: `selected || zoom >= 14` 일 때만 라벨 출력. 모바일 HTML: 라벨은 항상 그리되 OL declutter 가 충돌 시 자동 숨김. 호버 시점에는 라벨을 띄우지 않는다 — 호버는 fly-to 만 하고, 라벨이 등장하려면 클릭으로 select 까지 가야 한다.
- **단일 슬라이드오버는 별도 인스턴스** -- 어드민 식당 상세의 280px 사이드 카드와 풀 슬라이드오버는 각각 별도 `VWorldMap` (= 별도 OL `Map`) 을 그린다. 한 인스턴스를 `setTarget` 으로 옮기는 트릭은 OL view/layer 상태가 어색해져 안 쓴다.
- **첫 등록인데 apiKey 빈 PUT 은 거절** -- AI 와 달리 env fallback 이 없어 빈 행은 그대로 "키 없음" 과 동일하다. 그래서 `update()` 가 `existing` 이 없고 `apiKey` 도 비면 `apiKey is required for first registration` 에러를 던지고 라우트가 400 으로 변환 ([map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts) line 42-48).
- **DELETE 후 어드민 카드 즉시 갱신** -- `useDeleteMapProvider` 의 `onSuccess` 가 providers + secret 캐시 둘 다 invalidate. 키 삭제 직후 어드민 식당 상세를 보면 placeholder 가 즉시 "키 미설정" 으로 바뀌어야 정상.
- **ResizeObserver 도입 전엔 명시적 `updateSize()` 호출이 필요했음** -- 회귀 가능성 있는 사이즈 변경 케이스 (예: detail 패널 expand) 가 있으면 자동으로 처리되긴 하나, 컨테이너 자체가 detach/reattach 되는 경우는 ResizeObserver 도 cleanup 됨에 유의. 컨테이너가 unmount → 새 mount 인 케이스라면 새 `MapCanvas` 인스턴스에서 ResizeObserver 가 다시 붙으니 정상 작동, 다만 동일 인스턴스를 다른 DOM 위치로 옮기는 케이스는 없도록 주의.
- **앱 "내 위치" 버튼의 stale `denied` 와 silent refetch** -- 사용자가 OS 설정에서 권한을 다시 켜고 앱으로 돌아와도 `locationStatus` 는 아직 `denied` 로 stale 할 수 있다. `handleLocationPress` 가 클릭 시 무조건 `onRequestLocation()` 으로 시스템에 다시 묻는 게 핵심 — 그래야 권한이 풀린 경우 자동으로 `granted` 로 전환된다. 새 위치 권한 UI 를 추가할 때 "stale 상태로 버튼을 disable" 하지 말 것 — 거부 상태에서도 클릭 가능해야 회복 경로가 생긴다. `pending` 만 disable (응답 대기 중). 렌더 코어와 무관 — 자세한 위치 권한 상태머신은 [shared](shared.md)·앱 `useUserLocationNative` 참고.

## Sources [coverage: high -- 22 sources]

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
- [apps/web/src/lib/vworld.ts](../../apps/web/src/lib/vworld.ts)
- [apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx)
- [apps/web/src/components/restaurant/VWorldMap.tsx](../../apps/web/src/components/restaurant/VWorldMap.tsx)
- [apps/web/src/components/restaurant/PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx) — *modified: MyLocationButton denied/insecure 안내 (위치 권한 UX)*
- [apps/web/src/routes/admin/AdminSettingsPage.tsx](../../apps/web/src/routes/admin/AdminSettingsPage.tsx)
- [apps/web/src/routes/admin/AdminMapKeysPage.tsx](../../apps/web/src/routes/admin/AdminMapKeysPage.tsx)
- [apps/web/src/components/admin/AdminLayout.tsx](../../apps/web/src/components/admin/AdminLayout.tsx)
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx)
- [apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx)
- [apps/mobile/src/components/PublicRestaurantsWebMap.native.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.native.tsx) — *modified (2026-06-01): "내 위치" 버튼 denied/unavailable 클릭 가능 + silent refetch + Alert/openSettings 안내 (위치 권한 UX, 렌더 코어 무변경)*
- [apps/mobile/src/components/PublicRestaurantsWebMap.web.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.web.tsx)
- [apps/mobile/src/components/publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts)
